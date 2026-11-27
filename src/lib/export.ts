import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import { backupFileName, buildBackup, parseBackup, type GroupBackup } from './backup';
import { buildSummaryHtml } from './summary';
import type { Group } from './types';

/**
 * Exporting (backup file, PDF summary) and picking a backup to import. Mobile only: on web,
 * local files can't be shared this way, so these throw an ExportUnavailable error.
 */

export class ExportUnavailable extends Error {}

function ensureMobile() {
  if (Platform.OS === 'web') throw new ExportUnavailable();
}

async function share(uri: string, mimeType: string, dialogTitle: string, UTI: string) {
  if (!(await Sharing.isAvailableAsync())) throw new ExportUnavailable();
  await Sharing.shareAsync(uri, { mimeType, dialogTitle, UTI });
}

/** A file in the cache with this name, replacing any previous one. */
function cacheFile(name: string): File {
  const file = new File(Paths.cache, name);
  if (file.exists) file.delete();
  return file;
}

/** Writes the group's backup (JSON) and opens the share sheet (Drive, WhatsApp, email…). */
export async function shareBackup(group: Group): Promise<void> {
  ensureMobile();
  const file = cacheFile(backupFileName(group));
  file.create();
  await file.write(JSON.stringify(buildBackup(group), null, 2));
  await share(file.uri, 'application/json', `Copia de «${group.name}»`, 'public.json');
}

/** Prints the group's summary to a PDF and opens the share sheet. */
export async function shareSummaryPdf(group: Group): Promise<void> {
  if (Platform.OS === 'web') {
    printHtmlOnWeb(buildSummaryHtml(group));
    return;
  }
  // A4 at 72 ppi (the default is US Letter).
  const { uri } = await Print.printToFileAsync({ html: buildSummaryHtml(group), width: 595, height: 842 });
  // Give it a readable name instead of the random one.
  const pdf = cacheFile(backupFileName(group).replace(/^bote-/, 'bote-resumen-').replace(/\.json$/, '.pdf'));
  await new File(uri).move(pdf);
  await share(pdf.uri, 'application/pdf', `Resumen de «${group.name}»`, 'com.adobe.pdf');
}

/**
 * Web: opens the browser's print dialog for the summary, where "Save as PDF" is available.
 * expo-print can't do this on web (it ignores the HTML and prints the current screen), so the
 * summary is loaded in a hidden iframe and that frame is printed. The document <title> (the group
 * name) becomes the suggested file name.
 */
function printHtmlOnWeb(html: string) {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  Object.assign(frame.style, { position: 'fixed', width: '0', height: '0', border: '0', right: '0', bottom: '0' });
  frame.srcdoc = html;
  frame.onload = () => {
    const win = frame.contentWindow;
    if (!win) return;
    // Remove the frame once the dialog closes (or after a while, if afterprint never fires).
    const cleanup = () => frame.remove();
    win.addEventListener('afterprint', cleanup, { once: true });
    setTimeout(cleanup, 60_000);
    win.focus();
    win.print();
  };
  document.body.appendChild(frame);
}

/** Lets the user pick a backup file and validates it. Null if they cancel. Throws BackupError. */
export async function pickBackup(): Promise<GroupBackup | null> {
  ensureMobile();
  const result = await DocumentPicker.getDocumentAsync({
    // Some file managers don't tag .json files, so accept any file and validate the content.
    type: ['application/json', 'text/plain', '*/*'],
    copyToCacheDirectory: true,
  });
  if (result.canceled) return null;
  const text = await new File(result.assets[0].uri).text();
  return parseBackup(text);
}
