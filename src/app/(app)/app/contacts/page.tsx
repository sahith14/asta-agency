import { db } from '@/lib/db'
import { requirePageUser, canManageClients } from '../_lib'
import { ContactsClient } from './contacts-client'

export default async function ContactsPage() {
  const user = await requirePageUser()

  const [contacts, clients] = await Promise.all([
    db.contact.findMany({
      orderBy: [{ isPrimary: 'desc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        title: true,
        email: true,
        phone: true,
        notes: true,
        isPrimary: true,
        createdAt: true,
        clientId: true,
        client: { select: { id: true, name: true } },
      },
    }),
    db.client.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
  ])

  return (
    <ContactsClient
      canManage={canManageClients(user)}
      contacts={contacts.map((c) => ({
        id: c.id,
        name: c.name,
        title: c.title,
        email: c.email,
        phone: c.phone,
        notes: c.notes,
        isPrimary: c.isPrimary,
        clientId: c.clientId,
        clientName: c.client.name,
      }))}
      clients={clients}
    />
  )
}
