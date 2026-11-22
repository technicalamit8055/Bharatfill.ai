package ai.bharatfill.platformscanner

import android.app.Activity
import android.content.Context
import android.content.IntentSender
import android.graphics.BitmapFactory
import android.net.Uri
import com.google.android.gms.common.ConnectionResult
import com.google.android.gms.common.GoogleApiAvailability
import com.google.mlkit.vision.documentscanner.GmsDocumentScannerOptions
import com.google.mlkit.vision.documentscanner.GmsDocumentScanning
import com.google.mlkit.vision.documentscanner.GmsDocumentScanningResult
import expo.modules.kotlin.Promise
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import kotlinx.coroutines.launch
import java.io.File
import java.io.IOException
import java.util.UUID

class ScanOptions : Record {
  @Field val maxPages: Int = 1
  @Field val allowGalleryImport: Boolean = false
}

/**
 * Google's on-device document scanner (ML Kit, run by Google Play services): edge detection,
 * perspective flattening, shadow and finger clean-up, on the phone. Pages come back as JPEGs in
 * the app's cache, where the capture session (`lib/scan/capture-session.ts`) treats them like
 * any other temporary page and deletes them once sealed or discarded.
 *
 * Images are never decoded here, only their headers (for width and height), so no pixel buffer
 * is held in memory. Error messages are fixed text: nothing about a page reaches JS or a log.
 */
class PlatformScannerModule : Module() {
  /** The scan open on screen. One at a time. */
  private var pending: Promise? = null

  override fun definition() = ModuleDefinition {
    Name("BharatfillPlatformScanner")

    Function("isAvailable") {
      val context = appContext.reactContext
      context != null &&
        GoogleApiAvailability.getInstance().isGooglePlayServicesAvailable(context) ==
        ConnectionResult.SUCCESS
    }

    AsyncFunction("scan") { options: ScanOptions, promise: Promise ->
      val activity = appContext.currentActivity
      if (activity == null) {
        promise.reject(ERR_UNAVAILABLE, "There is no screen to open the scanner from.", null)
      } else if (pending != null) {
        promise.reject(ERR_BUSY, "The scanner is already open.", null)
      } else {
        pending = promise
        start(activity, options)
      }
    }.runOnQueue(Queues.MAIN)

    OnActivityResult { _, payload ->
      val promise = if (payload.requestCode == REQUEST_CODE) settle() else null
      if (promise != null) {
        val result =
          if (payload.resultCode == Activity.RESULT_OK) {
            GmsDocumentScanningResult.fromActivityResultIntent(payload.data)
          } else {
            null
          }
        val uris = result?.pages.orEmpty().map { it.imageUri }
        if (uris.isEmpty()) {
          promise.resolve(mapOf("canceled" to true, "pages" to emptyList<Any>()))
        } else {
          // Copying a page out of another app's storage is file I/O: off the main thread.
          appContext.backgroundCoroutineScope.launch {
            try {
              val context = requireNotNull(appContext.reactContext)
              promise.resolve(
                mapOf("canceled" to false, "pages" to uris.map { describe(context, it) }),
              )
            } catch (_: Exception) {
              promise.reject(ERR_READ, "The scanned pages could not be read.", null)
            }
          }
        }
      }
    }
  }

  private fun start(activity: Activity, options: ScanOptions) {
    val scannerOptions =
      GmsDocumentScannerOptions.Builder()
        // Full mode: edge detection, flattening, filters, and ML clean-up of stains and fingers.
        .setScannerMode(GmsDocumentScannerOptions.SCANNER_MODE_FULL)
        .setGalleryImportAllowed(options.allowGalleryImport)
        .setPageLimit(options.maxPages.coerceIn(1, MAX_PAGES))
        .setResultFormats(GmsDocumentScannerOptions.RESULT_FORMAT_JPEG)
        .build()
    GmsDocumentScanning.getClient(scannerOptions)
      .getStartScanIntent(activity)
      .addOnSuccessListener { sender ->
        try {
          activity.startIntentSenderForResult(sender, REQUEST_CODE, null, 0, 0, 0)
        } catch (_: IntentSender.SendIntentException) {
          settle()?.reject(ERR_UNAVAILABLE, "The scanner could not be opened.", null)
        }
      }
      // No Play services, too little memory, or the scanner module could not be installed.
      .addOnFailureListener {
        settle()?.reject(ERR_UNAVAILABLE, "The scanner is not available on this phone.", null)
      }
  }

  /** Takes the pending scan's promise, so it is settled exactly once. */
  private fun settle(): Promise? {
    val promise = pending
    pending = null
    return promise
  }

  /**
   * A page as a JPEG in the app's cache, with its size read from the file header only. A page
   * handed over anywhere else is copied into the cache; if the original was one of the app's
   * own files, it is deleted, so no plaintext copy is left outside the cache.
   */
  private fun describe(context: Context, uri: Uri): Map<String, Any> {
    val file = inCache(context, uri)
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeFile(file.path, bounds)
    if (bounds.outWidth <= 0 || bounds.outHeight <= 0) throw IOException("Not an image.")
    return mapOf(
      "uri" to Uri.fromFile(file).toString(),
      "width" to bounds.outWidth,
      "height" to bounds.outHeight,
    )
  }

  private fun inCache(context: Context, uri: Uri): File {
    val cache = context.cacheDir.canonicalFile
    val source = if (uri.scheme == "file") uri.path?.let { File(it).canonicalFile } else null
    if (source != null && source.path.startsWith(cache.path + File.separator)) return source

    val folder = File(cache, "platform-scan").apply { mkdirs() }
    val target = File(folder, "${UUID.randomUUID()}.jpg")
    val input = context.contentResolver.openInputStream(uri) ?: throw IOException("Unreadable.")
    input.use { stream -> target.outputStream().use { stream.copyTo(it) } }

    val appData = File(context.applicationInfo.dataDir).canonicalFile
    if (source != null && source.path.startsWith(appData.path + File.separator)) source.delete()
    return target
  }

  private companion object {
    const val REQUEST_CODE = 0x5ca7
    /** `MULTI_PAGE_LIMIT` in `lib/scan/scan-session.ts`. */
    const val MAX_PAGES = 24
    const val ERR_UNAVAILABLE = "ERR_SCANNER_UNAVAILABLE"
    const val ERR_BUSY = "ERR_SCANNER_BUSY"
    const val ERR_READ = "ERR_SCAN_READ"
  }
}
