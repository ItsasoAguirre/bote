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
  ensureMobile();
  // A4 at 72 ppi (the default is US Letter).
  const { uri } = await Print.printToFileAsync({ html: buildSummaryHtml(group), width: 595, height: 842 });
  // Give it a readable name instead of the random one.
  const pdf = cacheFile(backupFileName(group).replace(/^bote-/, 'bote-resumen-').replace(/\.json$/, '.pdf'));
  await new File(uri).move(pdf);
  await share(pdf.uri, 'application/pdf', `Resumen de «${group.name}»`, 'com.adobe.pdf');
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
