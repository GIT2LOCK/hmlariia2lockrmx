export function ownsFolder(folder: { criado_por: number | null } | null | undefined, callerId: number) {
  return !!folder && folder.criado_por === callerId;
}