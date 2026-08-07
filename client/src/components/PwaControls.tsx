import { useEffect, useState } from 'react';

import { Icon } from './Icon';

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

export function PwaControls() {
  const [online, setOnline] = useState(navigator.onLine);
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    const install = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPrompt);
    };
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    window.addEventListener('beforeinstallprompt', install);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
      window.removeEventListener('beforeinstallprompt', install);
    };
  }, []);

  const install = async () => {
    if (!prompt) return;
    await prompt.prompt();
    setPrompt(null);
  };

  return (
    <div className="flex items-center gap-1.5">
      {!online && <span className="hidden rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800 sm:inline dark:bg-amber-500/20 dark:text-amber-200">Offline</span>}
      {prompt && (
        <button className="btn-secondary px-2.5 py-1.5 text-xs" onClick={() => void install()} title="Install this app on your device">
          <Icon name="download" size={15} /> <span className="hidden sm:inline">Install app</span>
        </button>
      )}
    </div>
  );
}
