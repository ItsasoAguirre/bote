import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { CategoryManager } from '@/components/categories';
import { useGroupActions } from '@/components/group-actions';
import { GroupForm } from '@/components/group-form';
import { RecurringManager } from '@/components/recurring-manager';
import { AppText, Button, Chip, Field } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useExport } from '@/hooks/use-export';
import { useGroup, useGroups } from '@/store/groups';

export default function EditGroupScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const group = useGroup(id);
  const { updateGroup, setMuted } = useGroups();
  const { exporting, run: runExport } = useExport(group);
  const actions = useGroupActions(() => router.dismissTo('/'));

  if (!group) return null;

  const creator = actions.isCreator(group);

  return (
    <GroupForm
      group={group}
      submitLabel="Guardar cambios"
      onSubmit={(input) => {
        void updateGroup(group.id, input);
        router.back();
      }}
      extra={
        <>
          <CategoryManager group={group} />
          <RecurringManager group={group} />
          <Field label="Notificaciones">
            <View style={{ flexDirection: 'row' }}>
              <Chip
                label={group.muted ? '🔕 Silenciadas' : '🔔 Activadas'}
                selected={!group.muted}
                onPress={() => void setMuted(group.id, !group.muted)}
              />
            </View>
            <AppText variant="caption">
              {group.muted
                ? 'No recibirás avisos de este grupo. Solo te afecta a ti.'
                : 'Te avisamos cuando alguien añade un gasto y cuando te pagan. Solo te afecta a ti.'}
            </AppText>
          </Field>
          <Field label="Exportar">
            <View style={{ gap: Spacing.sm }}>
              <Button
                title={exporting === 'pdf' ? 'Generando PDF…' : '📄 Resumen en PDF'}
                variant="secondary"
                disabled={exporting !== null}
                onPress={() => void runExport('pdf')}
              />
              <Button
                title={exporting === 'backup' ? 'Preparando copia…' : '💾 Copia de seguridad'}
                variant="secondary"
                disabled={exporting !== null}
                onPress={() => void runExport('backup')}
              />
              <AppText variant="caption">
                El PDF resume totales, saldos, cómo saldar y todos los movimientos. La copia de seguridad es un
                archivo que puedes guardar (Drive, correo…) y volver a importar desde «Importar» en la pantalla
                principal.
              </AppText>
            </View>
          </Field>
          <Field label="Gestión del grupo">
            <View style={{ gap: Spacing.sm }}>
              <Button
                title={group.archived ? 'Desarchivar' : 'Archivar'}
                variant="secondary"
                onPress={() => {
                  actions.toggleArchive(group);
                  router.back();
                }}
              />
              <AppText variant="caption">
                {group.archived
                  ? 'Volverá a tu lista de grupos.'
                  : 'Lo quita de tu lista sin borrar nada. Solo te afecta a ti y puedes recuperarlo desde «Archivados».'}
              </AppText>
              {creator ? (
                <>
                  <Button title="Eliminar grupo" variant="danger" onPress={() => actions.confirmDelete(group)} />
                  <AppText variant="caption">
                    Lo borra con todos sus gastos para todos los participantes. Solo puede hacerlo quien lo creó.
                  </AppText>
                </>
              ) : (
                <>
                  <Button title="Salir del grupo" variant="danger" onPress={() => actions.confirmLeave(group)} />
                  <AppText variant="caption">
                    Desaparece de este móvil; los demás lo siguen viendo. Solo quien lo creó puede eliminarlo.
                  </AppText>
                </>
              )}
            </View>
          </Field>
        </>
      }
    />
  );
}
