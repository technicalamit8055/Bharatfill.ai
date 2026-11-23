package ai.bharatfill.pdfpages

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.pdf.LoadParams
import android.graphics.pdf.PdfRenderer
import android.graphics.pdf.PdfRendererPreV
import android.graphics.pdf.RenderParams
import android.net.Uri
import android.os.Build
import android.os.ParcelFileDescriptor
import android.os.ext.SdkExtensions
import androidx.annotation.RequiresApi
import androidx.annotation.RequiresExtension
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.util.UUID

/**
 * Turns a PDF the citizen picked into page images, on the phone, with Android's own renderer
 * (`android.graphics.pdf`, Pdfium inside the OS). Each page is drawn on white and written as a
 * JPEG in the app's cache, where the capture session (`lib/scan/capture-session.ts`) treats it
 * like any other temporary page and deletes it once sealed into the vault or discarded.
 *
 * A password-locked PDF (e-Aadhaar, bank statements) opens with the password the citizen typed,
 * on Android 15, or on Android 12–14 with the April 2024 system update (SDK extension 13). On
 * older phones it cannot be opened here, and the citizen is told so. The password is used only
 * to open the file: it is never stored, logged or put in an error.
 *
 * Error messages are fixed text: nothing about the file reaches JS or a log.
 */
class PdfPagesModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("BharatfillPdfPages")

    /** Whether a password-locked PDF can be opened on this phone. */
    Function("supportsPasswords") { passwordsSupported() }

    AsyncFunction("render") { uri: String, password: String?, maxPages: Int ->
      val context = appContext.reactContext ?: throw CodedException(ERR_READ, READ_FAILED, null)
      render(context, cacheFile(context, uri), password?.takeIf { it.isNotEmpty() }, maxPages)
    }
  }

  private fun render(
    context: Context,
    file: File,
    password: String?,
    maxPages: Int,
  ): Map<String, Any> {
    val folder = File(context.cacheDir, "pdf-import").apply { mkdirs() }
    val written = mutableListOf<File>()
    try {
      open(file, password).use { document ->
        val total = document.pageCount
        if (total <= 0) throw CodedException(ERR_READ, READ_FAILED, null)
        val pages =
          (0 until minOf(total, maxPages.coerceIn(1, MAX_PAGES))).map { index ->
            val bitmap = document.render(index)
            try {
              val target = File(folder, "${UUID.randomUUID()}.jpg")
              written += target
              target.outputStream().use { bitmap.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, it) }
              mapOf(
                "uri" to Uri.fromFile(target).toString(),
                "width" to bitmap.width,
                "height" to bitmap.height,
              )
            } finally {
              bitmap.recycle()
            }
          }
        return mapOf("pageCount" to total, "pages" to pages)
      }
    } catch (error: CodedException) {
      written.forEach { it.delete() }
      throw error
    } catch (_: OutOfMemoryError) {
      written.forEach { it.delete() }
      throw CodedException(ERR_READ, READ_FAILED, null)
    } catch (_: Exception) {
      written.forEach { it.delete() }
      throw CodedException(ERR_READ, READ_FAILED, null)
    }
  }

  /**
   * The picked file, which must be a plain file in the app's cache (where the document picker
   * copies it): this module reads nothing else.
   */
  private fun cacheFile(context: Context, uri: String): File {
    val parsed = Uri.parse(uri)
    val path = parsed.path
    if (parsed.scheme != "file" || path == null) throw CodedException(ERR_READ, READ_FAILED, null)
    val file = File(path).canonicalFile
    val cache = context.cacheDir.canonicalFile
    if (!file.path.startsWith(cache.path + File.separator) || !file.isFile) {
      throw CodedException(ERR_READ, READ_FAILED, null)
    }
    return file
  }

  private fun open(file: File, password: String?): PdfDocument {
    val descriptor = ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
    try {
      return when {
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.VANILLA_ICE_CREAM ->
          ModernPdf(PdfRenderer(descriptor, modernLoadParams(password)))
        // Written out rather than `hasPreVRenderer()`, so lint can see the guard.
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.S &&
          SdkExtensions.getExtensionVersion(Build.VERSION_CODES.S) >= PRE_V_EXTENSION ->
          PreVPdf(PdfRendererPreV(descriptor, loadParams(password)))
        // The old renderer has no password at all: a locked file cannot be opened here.
        password != null -> throw CodedException(ERR_LOCKED_UNSUPPORTED, LOCKED_UNSUPPORTED, null)
        else -> LegacyPdf(PdfRenderer(descriptor))
      }
    } catch (_: SecurityException) {
      runCatching { descriptor.close() }
      throw if (passwordsSupported()) {
        CodedException(ERR_LOCKED, LOCKED, null)
      } else {
        CodedException(ERR_LOCKED_UNSUPPORTED, LOCKED_UNSUPPORTED, null)
      }
    } catch (error: Exception) {
      runCatching { descriptor.close() }
      throw error
    }
  }

  @RequiresExtension(extension = Build.VERSION_CODES.S, version = PRE_V_EXTENSION)
  private fun loadParams(password: String?): LoadParams =
    LoadParams.Builder().apply { if (password != null) setPassword(password) }.build()

  /** The same, on Android 15, where these classes are part of the platform. */
  @RequiresApi(Build.VERSION_CODES.VANILLA_ICE_CREAM)
  private fun modernLoadParams(password: String?): LoadParams =
    LoadParams.Builder().apply { if (password != null) setPassword(password) }.build()

  private fun passwordsSupported(): Boolean =
    Build.VERSION.SDK_INT >= Build.VERSION_CODES.VANILLA_ICE_CREAM || hasPreVRenderer()

  /** Android 12–14 with SDK extension 13, which brings the password-aware renderer. */
  private fun hasPreVRenderer(): Boolean =
    Build.VERSION.SDK_INT >= Build.VERSION_CODES.S &&
      SdkExtensions.getExtensionVersion(Build.VERSION_CODES.S) >= PRE_V_EXTENSION

  private companion object {
    /** `MULTI_PAGE_LIMIT` in `lib/scan/scan-session.ts`. */
    const val MAX_PAGES = 24
    const val JPEG_QUALITY = 92

    const val ERR_READ = "ERR_PDF_READ"
    const val ERR_LOCKED = "ERR_PDF_LOCKED"
    const val ERR_LOCKED_UNSUPPORTED = "ERR_PDF_LOCKED_UNSUPPORTED"
    const val READ_FAILED = "The PDF could not be read."
    const val LOCKED = "The PDF needs its password."
    const val LOCKED_UNSUPPORTED = "Password-locked PDFs cannot be opened on this phone."
  }
}

/** The SDK extension (of Android 12, `S`) that brings the password-aware PDF renderer. */
private const val PRE_V_EXTENSION = 13

/** Pages are drawn at 300 dpi, with the long side capped so a big page cannot exhaust memory. */
private const val TARGET_DPI = 300f
private const val MAX_LONG_SIDE = 2400f

/** A blank white bitmap for a page of `width` × `height` points, and the matrix to draw into it. */
private fun canvasFor(width: Int, height: Int): Pair<Bitmap, Matrix> {
  val longSide = maxOf(width, height).coerceAtLeast(1)
  val scale = minOf(TARGET_DPI / 72f, MAX_LONG_SIDE / longSide)
  val bitmap =
    Bitmap.createBitmap(
      (width * scale).toInt().coerceAtLeast(1),
      (height * scale).toInt().coerceAtLeast(1),
      Bitmap.Config.ARGB_8888,
    )
  // Pages are transparent where nothing is printed; a JPEG would turn that black.
  bitmap.eraseColor(Color.WHITE)
  return bitmap to Matrix().apply { setScale(scale, scale) }
}

/** The three Android renderers behind one shape. */
private interface PdfDocument : AutoCloseable {
  val pageCount: Int

  fun render(index: Int): Bitmap
}

@RequiresApi(Build.VERSION_CODES.VANILLA_ICE_CREAM)
private class ModernPdf(private val renderer: PdfRenderer) : PdfDocument {
  override val pageCount: Int
    get() = renderer.pageCount

  override fun render(index: Int): Bitmap =
    renderer.openPage(index).use { page ->
      val (bitmap, matrix) = canvasFor(page.width, page.height)
      page.render(bitmap, null, matrix, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
      bitmap
    }

  override fun close() = renderer.close()
}

@RequiresExtension(extension = Build.VERSION_CODES.S, version = PRE_V_EXTENSION)
private class PreVPdf(private val renderer: PdfRendererPreV) : PdfDocument {
  override val pageCount: Int
    get() = renderer.pageCount

  override fun render(index: Int): Bitmap =
    renderer.openPage(index).use { page ->
      val (bitmap, matrix) = canvasFor(page.width, page.height)
      page.render(
        bitmap,
        null,
        matrix,
        RenderParams.Builder(RenderParams.RENDER_MODE_FOR_DISPLAY).build(),
      )
      bitmap
    }

  override fun close() = renderer.close()
}

private class LegacyPdf(private val renderer: PdfRenderer) : PdfDocument {
  override val pageCount: Int
    get() = renderer.pageCount

  override fun render(index: Int): Bitmap =
    renderer.openPage(index).use { page ->
      val (bitmap, matrix) = canvasFor(page.width, page.height)
      page.render(bitmap, null, matrix, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
      bitmap
    }

  override fun close() = renderer.close()
}
