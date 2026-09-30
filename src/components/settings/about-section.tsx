import { ExternalLink, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Logo } from '@/components/brand/logo';
import { Button } from '@/components/ui/button';
import { getBackend } from '@/lib/backend';
import { LICENSE, REPOSITORY_URL, TAGLINE } from '@/lib/app-meta';
import { openExternalLink } from '@/features/app/lifecycle';
import type { AppInfo } from '@/types/domain';
import { PreferenceGroup, PreferenceRow } from './preference-row';

export function AboutSection() {
  const [info, setInfo] = useState<AppInfo | null>(null);
  useEffect(() => {
    void getBackend()
      .getAppInfo()
      .then(setInfo)
      .catch(() => setInfo(null));
  }, []);

  return (
    <>
      <div className="mb-7 flex flex-col items-center pt-2 text-center">
        <Logo size={5} />
        <h3 className="mt-3 text-xl font-bold tracking-tight">Linotes</h3>
        <p className="mt-1 text-sm text-muted">{TAGLINE}</p>
        <p className="mt-2 rounded-full bg-hover px-2.5 py-0.5 text-xs tabular-nums">
          Version {info?.version ?? '…'}
        </p>
      </div>

      <PreferenceGroup>
        <PreferenceRow
          title="License"
          description="Free and open-source software."
          control={<span className="text-sm">{LICENSE}</span>}
        />
        <PreferenceRow
          title="Source code"
          description={
            REPOSITORY_URL || 'The public repository link will appear here once the project is published.'
          }
          control={
            REPOSITORY_URL ? (
              <Button size="sm" onClick={() => void openExternalLink(REPOSITORY_URL)}>
                <ExternalLink className="size-3.5" strokeWidth={2} /> Open
              </Button>
            ) : undefined
          }
        />
        <PreferenceRow
          title="Built with"
          description={`Tauri ${info?.tauriVersion ?? ''}, React, TipTap, SQLite`}
        />
      </PreferenceGroup>

      <PreferenceGroup>
        <div className="flex gap-3 px-4 py-3.5">
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-success" strokeWidth={1.8} />
          <div className="text-sm">
            <p className="font-medium">Private by design</p>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              Linotes has no accounts, analytics, telemetry or ads, and makes no network requests while you
              take notes. Links open only when you choose to open them. Notes are stored unencrypted as plain
              Markdown, so protect them like any other files — for example with disk encryption.
            </p>
          </div>
        </div>
      </PreferenceGroup>
    </>
  );
}
