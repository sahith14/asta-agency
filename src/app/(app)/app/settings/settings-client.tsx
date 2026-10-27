'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Info, Lock, Loader2, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import { adminFetch } from '@/components/internal/admin-bits'
import { SETTING_LABELS, SETTING_MAX_LENGTHS, type SettingKey } from '@/lib/settings'

const AGENCY_FIELDS: SettingKey[] = ['AGENCY_NAME', 'SUPPORT_EMAIL', 'WEBSITE_URL', 'CONTACT_PHONE', 'TIMEZONE', 'PORTAL_WELCOME']

export function SettingsClient({
  account,
  canManageAgency,
  initialSettings,
}: {
  account: { name: string; email: string; role: string; roleLabel: string }
  canManageAgency: boolean
  initialSettings: Record<SettingKey, string>
}) {
  const { toast } = useToast()
  const router = useRouter()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [agency, setAgency] = useState<Record<SettingKey, string>>(initialSettings)
  const [savingAgency, setSavingAgency] = useState(false)

  async function changePassword() {
    if (!currentPassword || !newPassword) {
      toast({ title: 'Both fields are required', variant: 'destructive' })
      return
    }
    if (newPassword.length < 10) {
      toast({ title: 'New password too short', description: 'Use at least 10 characters.', variant: 'destructive' })
      return
    }
    if (newPassword !== confirmPassword) {
      toast({ title: 'Passwords do not match', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      await adminFetch('/api/auth/password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      })
      toast({ title: 'Password changed', description: 'Your other sessions have been signed out.' })
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err) {
      toast({ title: 'Could not change password', description: err instanceof Error ? err.message : undefined, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  async function saveAgency() {
    setSavingAgency(true)
    try {
      const payload: Partial<Record<SettingKey, string>> = {}
      for (const key of AGENCY_FIELDS) payload[key] = agency[key]
      const data = await adminFetch<{ settings: Record<SettingKey, string> }>('/api/settings', {
        method: 'PUT',
        body: JSON.stringify(payload),
      })
      setAgency(data.settings)
      toast({ title: 'Agency profile saved', description: 'Changes are live across the app.' })
      router.refresh()
    } catch (err) {
      toast({ title: 'Could not save agency profile', description: err instanceof Error ? err.message : undefined, variant: 'destructive' })
    } finally {
      setSavingAgency(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground">Your account and the agency profile.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Agency profile</CardTitle>
          <CardDescription>
            Displayed across the app and the client portal. Billing, credentials and security settings are intentionally
            not managed here.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {AGENCY_FIELDS.map((key) => (
            <div key={key} className="grid gap-1.5">
              <Label htmlFor={`set-${key}`}>{SETTING_LABELS[key]}</Label>
              {key === 'PORTAL_WELCOME' ? (
                <Textarea
                  id={`set-${key}`}
                  value={agency[key]}
                  onChange={(e) => setAgency((a) => ({ ...a, [key]: e.target.value }))}
                  disabled={!canManageAgency}
                  rows={2}
                  maxLength={SETTING_MAX_LENGTHS[key]}
                  className="min-h-[44px]"
                  placeholder={canManageAgency ? 'Shown at the top of the client portal (optional)' : undefined}
                />
              ) : (
                <Input
                  id={`set-${key}`}
                  value={agency[key]}
                  onChange={(e) => setAgency((a) => ({ ...a, [key]: e.target.value }))}
                  disabled={!canManageAgency}
                  maxLength={SETTING_MAX_LENGTHS[key]}
                  className="h-11"
                />
              )}
            </div>
          ))}
          {canManageAgency ? (
            <Button onClick={() => void saveAgency()} disabled={savingAgency} className="h-11 w-full sm:w-auto">
              {savingAgency ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save agency profile
            </Button>
          ) : (
            <p className="text-xs text-muted-foreground">Only the Founder and Client Manager can change these values.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>Who you are signed in as.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Name</p>
            <p className="text-sm font-medium">{account.name}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Email</p>
            <p className="text-sm font-medium">{account.email}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Role</p>
            <Badge variant="secondary" className="mt-0.5">{account.roleLabel}</Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Change password</CardTitle>
          <CardDescription>
            Choose a strong password of at least 10 characters.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="current-password">Current password</Label>
            <Input
              id="current-password"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="h-11"
              autoComplete="current-password"
            />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="new-password">New password</Label>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="h-11"
                autoComplete="new-password"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="confirm-password">Confirm new password</Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="h-11"
                autoComplete="new-password"
              />
            </div>
          </div>
          <Button onClick={() => void changePassword()} disabled={saving} className="h-11 w-full sm:w-auto">
            <Lock className="h-4 w-4" /> {saving ? 'Changing…' : 'Change password'}
          </Button>
          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>About your sessions</AlertTitle>
            <AlertDescription>
              Changing your password signs out your other sessions — only the device you are using now stays
              signed in. This is expected behaviour, not an error.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  )
}
