'use client';

import React, { useRef } from 'react';
import dynamic from 'next/dynamic';
import { useSyncExternalStore } from 'react';

const ReactPlayer = dynamic(() => import('react-player/lazy'), { ssr: false });

interface VideoPlayerProps {
  url: string;
  title?: string;
}

function subscribe(callback: () => void) {
  window.addEventListener('online', callback);
  window.addEventListener('offline', callback);
  return () => {
    window.removeEventListener('online', callback);
    window.removeEventListener('offline', callback);
  };
}

function getSnapshot() {
  return navigator.onLine;
}

function getServerSnapshot() {
  return true;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({ url, title }) => {
  const isOnline = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return (
    <div className="fd-bg-card border fd-border-border rounded-lg shadow-sm w-full my-4 overflow-hidden relative" style={{ paddingTop: '56.25%' }}>
      {!isOnline && (
        <div className="absolute inset-0 fd-bg-card/80 backdrop-blur-sm flex items-center justify-center z-10">
          <p className="text-lg font-semibold fd-text-muted-foreground">
            Video not available offline
          </p>
        </div>
      )}
      <ReactPlayer
        url={url}
        width="100%"
        height="100%"
        controls={true}
        className="absolute top-0 left-0"
        title={title}
      />
    </div>
  );
};