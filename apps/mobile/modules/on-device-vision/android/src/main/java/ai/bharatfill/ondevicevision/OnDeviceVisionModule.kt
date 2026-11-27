package ai.bharatfill.ondevicevision

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Rect
import android.net.Uri
import android.util.Base64
import com.google.android.gms.common.ConnectionResult
import com.google.android.gms.common.GoogleApiAvailability
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.face.FaceDetection
import com.google.mlkit.vision.face.FaceDetectorOptions
import com.google.mlkit.vision.segmentation.subject.SubjectSegmentation
import com.google.mlkit.vision.segmentation.subject.SubjectSegmenterOptions
import com.google.mlkit.vision.text.Text
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.devanagari.DevanagariTextRecognizerOptions
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import java.io.File
import java.util.UUID

class ImageInput : Record {
  /** A `file://` URI of an image in the app's own storage. */
  @Field val uri: String? = null
  /** Or the image itself, base64 — a decrypted vault page that must never touch the disk. */
  @Field val base64: String? = null
}

/**
 * Google's on-device ML Kit models, run by Google Play services, for three jobs:
 *
 * - `readText`: the text on a page, in English and in Devanagari, for filing a document and
 *   searching the vault by what is printed on it (`lib/ocr/document-reading.ts`).
 * - `cutOutPortrait`: where the face is and which pixels are the person, for a studio passport
 *   photo (`lib/scan/studio-photo.ts`). The mask is written as a PNG in the app's cache, for the
 *   caller to read once and delete.
 *
 * Everything runs on the phone; nothing is uploaded. Recognised text is returned to JS and never
 * logged here. Error messages are fixed text: nothing about an image reaches a log.
 */
class OnDeviceVisionModule : Module() {
  private val latinReader by lazy { TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS) }
  private val devanagariReader by lazy {
    TextRecognition.getClient(DevanagariTextRecognizerOptions.Builder().build())
  }
  private val faceFinder by lazy {
    FaceDetection.getClient(
      FaceDetectorOptions.Builder()
        .setPerformanceMode(FaceDetectorOptions.PERFORMANCE_MODE_ACCURATE)
        .build(),
    )
  }
  private val personFinder by lazy {
    SubjectSegmentation.getClient(
      SubjectSegmenterOptions.Builder().enableForegroundConfidenceMask().build(),
    )
  }

  override fun definition() = ModuleDefinition {
    Name("BharatfillOnDeviceVision")

    Function("isAvailable") {
      val context = appContext.reactContext
      context != null &&
        GoogleApiAvailability.getInstance().isGooglePlayServicesAvailable(context) ==
        ConnectionResult.SUCCESS
    }

    // Async functions run off the main thread, so waiting on ML Kit's tasks here is safe.
    AsyncFunction("readText") { input: ImageInput ->
      val bitmap = decode(input.uri, input.base64, MAX_TEXT_SIDE)
      try {
        val image = InputImage.fromBitmap(bitmap, 0)
        val latin = runCatching { Tasks.await(latinReader.process(image)) }.getOrNull()
        val devanagari = runCatching { Tasks.await(devanagariReader.process(image)) }.getOrNull()
        // Neither model could run: not installed yet, or Play services is missing.
        if (latin == null && devanagari == null) {
          throw CodedException(ERR_UNAVAILABLE, "Text reading is not available on this phone.", null)
        }
        mapOf(
          "width" to bitmap.width,
          "height" to bitmap.height,
          "latin" to latin?.let(::linesOf),
          "devanagari" to devanagari?.let(::linesOf),
        )
      } finally {
        bitmap.recycle()
      }
    }

    AsyncFunction("cutOutPortrait") { uri: String ->
      val context = appContext.reactContext ?: throw CodedException(ERR_READ, READ_FAILED, null)
      val bitmap = decode(uri, null, MAX_PORTRAIT_SIDE)
      try {
        val image = InputImage.fromBitmap(bitmap, 0)
        val faces =
          try {
            Tasks.await(faceFinder.process(image))
          } catch (_: Exception) {
            throw CodedException(ERR_UNAVAILABLE, "Face finding is not available on this phone.", null)
          }
        val segmented =
          try {
            Tasks.await(personFinder.process(image))
          } catch (_: Exception) {
            throw CodedException(ERR_UNAVAILABLE, "Background removal is not available on this phone.", null)
          }
        val mask =
          segmented.foregroundConfidenceMask
            ?: throw CodedException(ERR_NO_PERSON, "No person was found in the photo.", null)
        val maskFile = writeMask(context, mask, bitmap.width, bitmap.height)
        mapOf(
          "maskUri" to Uri.fromFile(maskFile).toString(),
          "width" to bitmap.width,
          "height" to bitmap.height,
          "faces" to faces.map { box(it.boundingBox) },
        )
      } finally {
        bitmap.recycle()
      }
    }
  }

  /** Each recognised line with its box, in reading order as ML Kit gives it. */
  private fun linesOf(text: Text): List<Map<String, Any>> =
    text.textBlocks.flatMap { block ->
      block.lines.mapNotNull { line ->
        val value = line.text.trim()
        val bounds = line.boundingBox
        if (value.isEmpty() || bounds == null) null else mapOf("text" to value, "box" to box(bounds))
      }
    }

  private fun box(rect: Rect): List<Int> = listOf(rect.left, rect.top, rect.right, rect.bottom)

  /**
   * The image, shrunk by a power of two until its longer side is at most `maxSide`. Throws a
   * fixed-text error when it cannot be read.
   */
  private fun decode(uri: String?, base64: String?, maxSide: Int): Bitmap {
    val bytes: ByteArray? = base64?.let {
      try {
        Base64.decode(it, Base64.DEFAULT)
      } catch (_: IllegalArgumentException) {
        throw CodedException(ERR_READ, READ_FAILED, null)
      }
    }
    val path: String? = if (bytes == null) localPath(uri) else null
    if (bytes == null && path == null) throw CodedException(ERR_READ, READ_FAILED, null)

    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    if (bytes != null) BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
    else BitmapFactory.decodeFile(path, bounds)
    if (bounds.outWidth <= 0 || bounds.outHeight <= 0) throw CodedException(ERR_READ, READ_FAILED, null)

    var sample = 1
    while (maxOf(bounds.outWidth, bounds.outHeight) / sample > maxSide) sample *= 2
    val options = BitmapFactory.Options().apply {
      inSampleSize = sample
      inPreferredConfig = Bitmap.Config.ARGB_8888
    }
    val bitmap =
      if (bytes != null) BitmapFactory.decodeByteArray(bytes, 0, bytes.size, options)
      else BitmapFactory.decodeFile(path, options)
    return bitmap ?: throw CodedException(ERR_READ, READ_FAILED, null)
  }

  /** Only files in local storage are read. */
  private fun localPath(uri: String?): String? {
    if (uri == null) return null
    val parsed = Uri.parse(uri)
    return when (parsed.scheme) {
      "file" -> parsed.path
      null -> uri
      else -> null
    }
  }

  /** The person's confidence (0–1 per pixel) as a greyscale PNG in the cache: 0 black, 1 white. */
  private fun writeMask(context: Context, mask: java.nio.FloatBuffer, width: Int, height: Int): File {
    mask.rewind()
    val pixels = IntArray(width * height)
    for (index in pixels.indices) {
      val value = if (mask.hasRemaining()) (mask.get().coerceIn(0f, 1f) * 255f + 0.5f).toInt() else 0
      pixels[index] = (0xFF shl 24) or (value shl 16) or (value shl 8) or value
    }
    val bitmap = Bitmap.createBitmap(pixels, width, height, Bitmap.Config.ARGB_8888)
    try {
      val target = File(context.cacheDir, "portrait-mask-${UUID.randomUUID()}.png")
      target.outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
      return target
    } finally {
      bitmap.recycle()
    }
  }

  private companion object {
    /** A 300 dpi A4 page's long side: text stays readable without holding a huge bitmap. */
    const val MAX_TEXT_SIDE = 3600
    /** Plenty for a 35 × 45 mm photo at 300 dpi, and quick to segment. */
    const val MAX_PORTRAIT_SIDE = 1600
    const val ERR_UNAVAILABLE = "ERR_VISION_UNAVAILABLE"
    const val ERR_NO_PERSON = "ERR_VISION_NO_PERSON"
    const val ERR_READ = "ERR_VISION_READ"
    const val READ_FAILED = "The image could not be read."
  }
}
