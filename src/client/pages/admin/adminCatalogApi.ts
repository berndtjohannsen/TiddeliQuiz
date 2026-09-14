import type { PlayerPublic } from '../../../shared/types'
import { catalogRequest } from '../../catalogUi'
import { strings } from '../../strings'

/** Platform admin catalog, or one player's tree. */
export function adminCatalogBase(catalogOwner: PlayerPublic | null) {
  return catalogOwner
    ? `/api/admin/users/${encodeURIComponent(catalogOwner.id)}`
    : '/api/admin'
}

/** One catalog row change. */
export async function adminCatalogJson<T>(
  catalogOwner: PlayerPublic | null,
  method: string,
  path: string,
  body: unknown | undefined,
  onError: (message: string) => void,
  onSaved: () => void,
): Promise<T | null> {
  const result = await catalogRequest<T>(
    adminCatalogBase(catalogOwner),
    method,
    path,
    body,
    strings.loadFailed,
  )
  if ('error' in result) {
    onError(result.error)
    return null
  }
  onSaved()
  return result.data
}
