import type { Account, Project } from "./model"

export function projectClients(project: Pick<Project, "clientId" | "clientAccounts">, accounts: Account[]) {
  const saved = accounts.find(account => account.id === project.clientId && account.role === "client" && !account.id.startsWith("client:"))
  return project.clientAccounts ?? (saved ? [saved] : [])
}

export const projectClientNames = (project: Pick<Project, "clientId" | "clientAccounts">, accounts: Account[]) =>
  [...new Set(projectClients(project, accounts).map(client => client.name.trim()).filter(Boolean))]
