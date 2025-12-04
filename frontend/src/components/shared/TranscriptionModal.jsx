import { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useSocket } from '@/lib/SocketContext';
import { api } from '@/api/apiClient';

export default function TranscriptionModal({ open, onOpenChange, roomId, participants = [] }) {
  const socket = useSocket();
  const [tab, setTab] = useState('all');
  const [loading, setLoading] = useState(false);
  const [feed, setFeed] = useState([]); // array of {userId,userName,text,start_ms,end_ms,final,ts}
  const [interimByUser, setInterimByUser] = useState(new Map()); // userId -> { text, ts, userName }
  const maxItems = 200;
  const mountedRef = useRef(false);

  // Helper: add final line
  const pushFinal = (line) => {
    setFeed((prev) => {
      const next = [...prev, line];
      if (next.length > maxItems) next.splice(0, next.length - maxItems);
      return next;
    });
  };

  // Load existing transcripts when opened
  useEffect(() => {
    if (!open || !roomId) return;
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const items = await api.entities.GDTranscript.filter({ room_id: roomId });
        if (cancelled) return;
        const sorted = (items || [])
          .sort((a, b) => (a.start_ms || 0) - (b.start_ms || 0))
          .map((t) => ({
            userId: t.user_id,
            userName: t.user_name || participants.find((p) => p.user_id === t.user_id)?.name || t.user_id,
            text: t.text,
            start_ms: t.start_ms,
            end_ms: t.end_ms,
            final: true,
            ts: t.end_ms || Date.now(),
          }));
        setFeed(sorted.slice(-maxItems));
      } catch {}
      finally { setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [open, roomId]);

  // Subscribe to socket events
  useEffect(() => {
    if (!socket || !roomId || !open) return;
    try { socket.emit('join_room', `gd:${roomId}`); } catch {}

    const onTranscript = (msg) => {
      if (!msg || msg.roomId !== roomId) return;
      const { userId, userName, text, final, start_ms, end_ms, ts } = msg;
      if (!text) return;
      if (final) {
        pushFinal({ userId, userName, text, final: true, start_ms, end_ms, ts: ts || end_ms || Date.now() });
        setInterimByUser((m) => {
          const next = new Map(m);
          next.delete(userId);
          return next;
        });
      } else {
        setInterimByUser((m) => {
          const next = new Map(m);
          next.set(userId, { text, ts: ts || Date.now(), userName });
          return next;
        });
      }
    };

    socket.on('gd_transcript', onTranscript);
    return () => {
      try { socket.off('gd_transcript', onTranscript); } catch {}
    };
  }, [socket, roomId, open]);

  // Build per-user view
  const perUser = useMemo(() => {
    const map = new Map();
    for (const item of feed) {
      const key = item.userId || 'unknown';
      const arr = map.get(key) || [];
      arr.push(item);
      map.set(key, arr);
    }
    return map;
  }, [feed]);

  const getName = (uid, fallback) => {
    return (
      participants.find((p) => String(p.user_id) === String(uid))?.name || fallback || String(uid).slice(0, 6)
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[80vh] overflow-hidden p-0">
        <DialogHeader className="p-6 pb-2">
          <DialogTitle>Live Transcription</DialogTitle>
          <DialogDescription>Full stream and per-participant transcripts for this GD.</DialogDescription>
        </DialogHeader>
        <div className="px-6 pb-4">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="users">Participants</TabsTrigger>
            </TabsList>
            <TabsContent value="all">
              <div className="mt-3 h-[52vh] overflow-y-auto rounded-lg bg-gray-900/60 p-3 border border-white/10">
                {loading && <div className="text-sm text-gray-400">Loading previous transcript…</div>}
                {feed.map((line, idx) => (
                  <div key={`f-${idx}`} className="text-sm text-gray-100 mb-2">
                    <span className="text-purple-300 font-semibold mr-2">{getName(line.userId, line.userName)}:</span>
                    <span>{line.text}</span>
                  </div>
                ))}
                {[...interimByUser.entries()].map(([uid, v]) => (
                  <div key={`i-${uid}`} className="text-sm text-gray-300 mb-2 opacity-80">
                    <span className="text-purple-300 font-semibold mr-2">{getName(uid, v.userName)}:</span>
                    <span className="italic">{v.text}</span>
                  </div>
                ))}
                {!loading && feed.length === 0 && interimByUser.size === 0 && (
                  <div className="text-sm text-gray-400">No transcript yet. Start speaking to see live text here.</div>
                )}
              </div>
            </TabsContent>
            <TabsContent value="users">
              <div className="mt-3 h-[52vh] overflow-y-auto">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {Array.from(perUser.entries()).map(([uid, items]) => (
                    <div key={`u-${uid}`} className="rounded-lg bg-gray-900/60 p-3 border border-white/10">
                      <div className="font-semibold text-white mb-2">{getName(uid, items[0]?.userName)} <span className="text-xs text-gray-400 ml-2">{items.length} lines</span></div>
                      <div className="space-y-2 text-sm">
                        {items.slice(-20).map((line, j) => (
                          <div key={`li-${uid}-${j}`} className="text-gray-100">
                            <span>{line.text}</span>
                          </div>
                        ))}
                        {interimByUser.has(uid) && (
                          <div className="text-gray-300 opacity-80 italic">{interimByUser.get(uid)?.text}</div>
                        )}
                      </div>
                    </div>
                  ))}
                  {/* Users with no lines yet but present in room */}
                  {participants.filter(p => !perUser.has(p.user_id)).map((p) => (
                    <div key={`pn-${p.user_id}`} className="rounded-lg bg-gray-900/60 p-3 border border-white/10">
                      <div className="font-semibold text-white mb-2">{p.name || p.user_id}</div>
                      {interimByUser.has(p.user_id) ? (
                        <div className="text-sm text-gray-300 opacity-80 italic">{interimByUser.get(p.user_id)?.text}</div>
                      ) : (
                        <div className="text-sm text-gray-400">No lines yet.</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}
