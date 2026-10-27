'use client'

import { useMemo, useRef, useState } from 'react'
import { Download, FileUp, FolderOpen, Loader2, UploadCloud } from 'lucide-react'
import { ROLES } from '@/lib/constants'
import { formatDate } from '@/lib/format'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { apiUpload, errorMessage, withScope } from '@/components/portal/api'
import { FounderScopeGate, FounderViewingBar, useFounderClientId } from '@/components/portal/founder-scope'
import { EmptyState, ErrorBox, formatBytes, Spinner } from '@/components/portal/portal-ui'
import { useApi } from '@/components/portal/use-api'
import { useToast } from '@/hooks/use-toast'

type AssetRow = {
  id: string
  originalName: string
  sizeBytes: number
  mimeType: string
  createdAt: string
  projectId: string
  projectName: string
  uploadedByName: string
}

type ProjectRow = { id: string; name: string }

export function AssetsClient({ role }: { role: string }) {
  const isFounder = role === ROLES.FOUNDER
  const [clientId] = useFounderClientId()
  const scope = isFounder ? clientId : null
  const { data, error, loading, refetch } = useApi<{ assets: AssetRow[] }>(
    isFounder && !clientId ? null : withScope('/api/portal/assets', scope),
  )
  const projectsApi = useApi<{ projects: ProjectRow[] }>(
    isFounder && !clientId ? null : withScope('/api/portal/projects', scope),
  )
  const { toast } = useToast()

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [projectId, setProjectId] = useState<string>('')
  const [uploading, setUploading] = useState(false)

  const grouped = useMemo(() => {
    const map = new Map<string, { name: string; assets: AssetRow[] }>()
    for (const a of data?.assets ?? []) {
      const g = map.get(a.projectId) ?? { name: a.projectName, assets: [] }
      g.assets.push(a)
      map.set(a.projectId, g)
    }
    return Array.from(map.values())
  }, [data])

  async function onUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const file = fileInputRef.current?.files?.[0]
    if (!projectId) {
      toast({ title: 'Choose a project', description: 'Pick which project the files belong to.', variant: 'destructive' })
      return
    }
    if (!file) {
      toast({ title: 'Choose a file', description: 'Select a file to upload first.', variant: 'destructive' })
      return
    }
    setUploading(true)
    try {
      const form = new FormData()
      form.set('file', file)
      form.set('projectId', projectId)
      await apiUpload('/api/portal/assets', form)
      toast({ title: 'File uploaded', description: `"${file.name}" was sent to our team. Thank you!` })
      if (fileInputRef.current) fileInputRef.current.value = ''
      refetch()
    } catch (err) {
      toast({ title: 'Upload failed', description: errorMessage(err), variant: 'destructive' })
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-6">
      {isFounder && clientId ? <FounderViewingBar /> : null}

      <header>
        <h1 className="text-2xl font-bold tracking-tight">Files</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Share logos, photos and documents with us — and download anything we&apos;ve shared with you.
        </p>
      </header>

      {error ? <ErrorBox message={error} /> : null}
      {loading ? <Spinner /> : null}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileUp className="h-4 w-4 text-primary" aria-hidden />
            Upload files
          </CardTitle>
          <CardDescription>
            Images (JPG, PNG, WebP, GIF), PDF, Word, Excel, PowerPoint-style text, CSV, ZIP, MP4 or MP3 — up to 10MB per
            file.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onUpload} className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-2">
              <Label htmlFor="upload-project">Project</Label>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger id="upload-project" className="min-h-11 w-full sm:w-64">
                  <SelectValue placeholder="Which project is this for?" />
                </SelectTrigger>
                <SelectContent>
                  {(projectsApi.data?.projects ?? []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 space-y-2">
              <Label htmlFor="upload-file">File</Label>
              <Input
                id="upload-file"
                type="file"
                ref={fileInputRef}
                accept="image/jpeg,image/png,image/webp,image/gif,application/pdf,text/plain,text/csv,application/zip,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,video/mp4,audio/mpeg"
                className="min-h-11 file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:text-sm file:font-medium file:text-primary-foreground"
              />
            </div>
            <Button type="submit" className="min-h-11" disabled={uploading}>
              {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <UploadCloud className="mr-2 h-4 w-4" aria-hidden />}
              {uploading ? 'Uploading…' : 'Upload'}
            </Button>
          </form>
          <p className="mt-3 text-xs text-muted-foreground">
            Maximum 10MB per file. Files are only visible to our team and you — never to the public.
          </p>
        </CardContent>
      </Card>

      {!loading && !error && grouped.length === 0 ? (
        <EmptyState
          title="No files yet"
          hint="No files yet — upload your logos and photos here. Anything you upload appears in the list below."
          icon={FolderOpen}
        />
      ) : null}

      {grouped.map((g) => (
        <Card key={g.name}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{g.name}</CardTitle>
            <CardDescription>
              {g.assets.length} file{g.assets.length === 1 ? '' : 's'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {g.assets.map((a) => (
                <li key={a.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{a.originalName}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatBytes(a.sizeBytes)} · {formatDate(a.createdAt)} · uploaded by{' '}
                      {a.uploadedByName}
                    </p>
                  </div>
                  <Button asChild variant="outline" size="sm" className="min-h-11 sm:min-w-32">
                    <a href={`/api/assets/${a.id}/download`} download>
                      <Download className="mr-2 h-4 w-4" aria-hidden />
                      Download
                    </a>
                  </Button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ))}

      <Alert>
        <AlertDescription className="text-xs text-muted-foreground">
          Uploads are virus-checked by type and size limits and are stored privately — files are only delivered through
          secure, authorised download links.
        </AlertDescription>
      </Alert>
    </div>
  )
}
