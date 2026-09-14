import type { PlayerPublic } from '../../../shared/types'
import { strings } from '../../strings'

/** Player accounts. Open one to edit that user's private folders. */
export function AdminUsers(props: {
  users: PlayerPublic[]
  onOpen: (user: PlayerPublic) => void
}) {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-medium">{strings.usersSection}</h2>
      <p className="text-sm text-slate-400">{strings.usersHint}</p>
      <ul className="overflow-auto rounded border border-slate-700">
        {props.users.length === 0 ? (
          <li className="p-3 text-sm text-slate-400">{strings.usersEmpty}</li>
        ) : (
          props.users.map((u) => (
            <li key={u.id}>
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-sm hover:bg-slate-800"
                onClick={() => props.onOpen(u)}
              >
                <span className="block font-medium">{u.username}</span>
                <span className="block text-xs text-slate-400">{strings.usersOpenCatalog}</span>
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  )
}
