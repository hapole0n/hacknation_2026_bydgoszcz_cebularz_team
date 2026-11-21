import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { APP_NAME } from '@/config/app';
import { LANGUAGES } from '@/i18n';

type Health = { status: 'ok' | 'degraded'; db: 'up' | 'down'; time: string };

const fetchHealth = async (): Promise<Health> => {
  const res = await fetch('/api/health');
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
};

export function App() {
  const { t, i18n } = useTranslation();
  const health = useQuery({ queryKey: ['health'], queryFn: fetchHealth, refetchInterval: 10_000, retry: false });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="flex items-center justify-between border-b px-6 py-4">
        <div>
          <h1 className="text-xl font-semibold">{APP_NAME}</h1>
          <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        <div className="flex items-center gap-2" role="group" aria-label={t('language')}>
          {LANGUAGES.map((lng) => (
            <Button
              key={lng}
              size="sm"
              variant={i18n.language === lng ? 'default' : 'outline'}
              onClick={() => i18n.changeLanguage(lng)}
            >
              {lng.toUpperCase()}
            </Button>
          ))}
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-4 p-6">
        <Card>
          <CardHeader>
            <CardTitle>{t('health.title')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {health.isPending && <p>{t('health.loading')}</p>}
            {health.isError && <p className="text-destructive">{t('health.unreachable')}</p>}
            {health.data && (
              <>
                <p>
                  {t('health.api')}: <strong>{t(`health.${health.data.status}`)}</strong>
                </p>
                <p>
                  {t('health.db')}: <strong>{t(`health.${health.data.db}`)}</strong>
                </p>
              </>
            )}
          </CardContent>
        </Card>
        <p className="text-sm text-muted-foreground">{t('scaffold')}</p>
      </main>
    </div>
  );
}
