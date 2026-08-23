import { BackButton } from '@/components/ui/back-button';
import { cn } from '@/lib/utils';

interface PageShellProps {
  title?: string;
  action?: React.ReactNode;
  back?: string | (() => void);
  children: React.ReactNode;
  className?: string;
  shellClassName?: string;
  overlay?: React.ReactNode;
}

export function PageShell({ title, action, back, children, className, shellClassName, overlay }: PageShellProps) {
  return (
    <div className={cn('page-shell', shellClassName)}>
      <div className={cn('page-content space-y-5 py-5 md:py-7', className)}>
        {(title || back || action) && (
          <div className="page-header">
            <div className="flex min-w-0 items-center gap-3">
              {back && (typeof back === 'string' ? <BackButton href={back} /> : <BackButton onClick={back} />)}
              {title && <h1 className="page-header-title truncate">{title}</h1>}
            </div>
            {action}
          </div>
        )}
        {children}
      </div>
      {overlay}
    </div>
  );
}
