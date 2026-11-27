import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from 'react-native';

import { ExportUnavailable, shareBackup, shareSummaryPdf } from '@/lib/export';
import type { Group } from '@/lib/types';

export type ExportKind = 'pdf' | 'backup';

/** Runs an export (PDF summary or backup file), tracks which one is busy and shows errors. */
export function useExport(group: Group | undefined) {
  const { t } = useTranslation();
  const [exporting, setExporting] = useState<ExportKind | null>(null);

  const run = async (what: ExportKind) => {
    if (!group || exporting) return;
    setExporting(what);
    try {
      await (what === 'pdf' ? shareSummaryPdf(group) : shareBackup(group));
    } catch (e) {
      Alert.alert(
        t('useExport.failedTitle'),
        e instanceof ExportUnavailable ? t('useExport.mobileOnly') : t('useExport.failedMessage'),
      );
    } finally {
      setExporting(null);
    }
  };

  return { exporting, run };
}
