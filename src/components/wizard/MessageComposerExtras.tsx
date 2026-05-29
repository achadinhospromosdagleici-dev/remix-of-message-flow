import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Smile, Sticker, Mic, Square, Trash2, Loader2, Plus, Check, X as XIcon, Library } from 'lucide-react';
import EmojiPicker, { EmojiStyle, Theme } from 'emoji-picker-react';
import { toast } from 'sonner';
import { api } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

interface Props {
  onInsertText: (text: string) => void;
  onMediaReady: (opts: { url: string; type: 'image' | 'audio'; filename?: string }) => void;
}

interface MediaItem {
  id: string;
  media_type: 'audio' | 'sticker' | 'image';
  url: string;
  filename: string | null;
  duration_seconds: number | null;
  created_at: string;
}

export function MessageComposerExtras({ onInsertText, onMediaReady }: Props) {
  const { user } = useAuth();
  const [showEmoji, setShowEmoji] = useState(false);
  const [showStickers, setShowStickers] = useState(false);
  const [showAudios, setShowAudios] = useState(false);
  const stickerUploadRef = useRef<HTMLInputElement>(null);
  const [recording, setRecording] = useState(false);
  const [uploadingAudio, setUploadingAudio] = useState(false);
  const [uploadingSticker, setUploadingSticker] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelRef = useRef(false);
  const [stickers, setStickers] = useState<MediaItem[]>([]);
  const [audios, setAudios] = useState<MediaItem[]>([]);
  const [loadingLib, setLoadingLib] = useState(false);

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try { recorderRef.current.stop(); } catch {}
    }
  }, []);

  const loadLibrary = useCallback(async (kind: 'audio' | 'sticker') => {
    if (!user) return;
    setLoadingLib(true);
    try {
      const data = (await api.get('media_library', { media_type: kind })) || [];
      if (kind === 'sticker') setStickers(data as MediaItem[]);
      else setAudios(data as MediaItem[]);
    } catch (err: any) {
      toast.error(`Falha ao carregar biblioteca: ${err.message || ''}`);
    } finally {
      setLoadingLib(false);
    }
  }, [user]);

  const openStickerGallery = async () => {
    setShowStickers(true);
    await loadLibrary('sticker');
  };
  const openAudioGallery = async () => {
    setShowAudios(true);
    await loadLibrary('audio');
  };

  const uploadFile = async (file: File | Blob, folder: string, filename: string, contentType: string) => {
    const formData = new FormData();
    formData.append('file', file);
    const token = localStorage.getItem('auth_token');
    const res = await fetch('/api/upload', {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Upload failed');
    return data.url;
  };

  const saveToLibrary = async (item: {
    media_type: 'audio' | 'sticker';
    url: string;
    filename?: string;
    size_bytes?: number;
    duration_seconds?: number;
  }) => {
    if (!user) return;
    try {
      await api.post('media_library', {
        user_id: user.id,
        ...item,
      });
    } catch (err) {
      console.error('[media_library] save error', err);
    }
  };

  const handleStickerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Figurinha muito grande (máx. 5MB)');
      return;
    }
    setUploadingSticker(true);
    try {
      // Converter para .webp 512x512 (formato padrão WhatsApp)
      const webpBlob = await convertToWebpSticker(file);
      const baseName = file.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 50);
      const safe = `${baseName || 'sticker'}.webp`;
      const url = await uploadFile(webpBlob, 'stickers', safe, 'image/webp');
      await saveToLibrary({ media_type: 'sticker', url, filename: safe, size_bytes: webpBlob.size });
      toast.success('Figurinha salva na galeria!');
      await loadLibrary('sticker');
    } catch (err: any) {
      toast.error(`Falha: ${err.message || 'erro'}`);
    } finally {
      setUploadingSticker(false);
      e.target.value = '';
    }
  };

  const useSticker = (s: MediaItem) => {
    onMediaReady({ url: s.url, type: 'image', filename: s.filename || 'sticker.webp' });
    setShowStickers(false);
    toast.success('Figurinha selecionada!');
  };

  const useAudio = (a: MediaItem) => {
    onMediaReady({ url: a.url, type: 'audio', filename: a.filename || 'audio.webm' });
    setShowAudios(false);
    toast.success('Áudio selecionado!');
  };

  const deleteItem = async (item: MediaItem) => {
    try {
      await api.del('media_library', item.id);
      if (item.media_type === 'sticker') setStickers(s => s.filter(x => x.id !== item.id));
      else setAudios(a => a.filter(x => x.id !== item.id));
      toast.success('Removido da biblioteca');
    } catch (err: any) {
      toast.error(`Falha: ${err.message || ''}`);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';
      const mr = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];
      cancelRef.current = false;
      mr.ondataavailable = (ev) => { if (ev.data.size) chunksRef.current.push(ev.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const duration = seconds;
        if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
        setRecording(false);
        if (cancelRef.current) { setSeconds(0); return; }
        const blob = new Blob(chunksRef.current, { type: mime });
        if (blob.size < 1000) { toast.error('Áudio muito curto'); setSeconds(0); return; }
        setUploadingAudio(true);
        try {
          const filename = `voice_${Date.now()}.webm`;
          const url = await uploadFile(blob, 'audio', filename, mime);
          await saveToLibrary({
            media_type: 'audio',
            url,
            filename,
            size_bytes: blob.size,
            duration_seconds: duration,
          });
          onMediaReady({ url, type: 'audio', filename });
          toast.success('Áudio gravado, salvo na biblioteca e adicionado!');
        } catch (err: any) {
          toast.error(`Falha: ${err.message || 'erro'}`);
        } finally {
          setUploadingAudio(false);
          setSeconds(0);
        }
      };
      recorderRef.current = mr;
      mr.start();
      setRecording(true);
      setSeconds(0);
      timerRef.current = setInterval(() => setSeconds(s => s + 1), 1000);
    } catch (err: any) {
      toast.error('Não foi possível acessar o microfone');
    }
  };

  const stopRecording = (cancel = false) => {
    cancelRef.current = cancel;
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
  };

  const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  const convertToWebpSticker = (file: File): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const reader = new FileReader();
      reader.onload = () => { img.src = reader.result as string; };
      reader.onerror = () => reject(new Error('Falha ao ler arquivo'));
      img.onload = () => {
        const SIZE = 512;
        const canvas = document.createElement('canvas');
        canvas.width = SIZE;
        canvas.height = SIZE;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas indisponível'));
        // Fit contendo a imagem em 512x512 com fundo transparente
        const ratio = Math.min(SIZE / img.width, SIZE / img.height);
        const w = img.width * ratio;
        const h = img.height * ratio;
        const x = (SIZE - w) / 2;
        const y = (SIZE - h) / 2;
        ctx.clearRect(0, 0, SIZE, SIZE);
        ctx.drawImage(img, x, y, w, h);
        canvas.toBlob(
          (blob) => blob ? resolve(blob) : reject(new Error('Falha ao converter para WebP')),
          'image/webp',
          0.92
        );
      };
      img.onerror = () => reject(new Error('Imagem inválida'));
      reader.readAsDataURL(file);
    });
  };

  return (
    <div className="relative flex items-center gap-2 px-1">
      {/* Emoji */}
      <button
        type="button"
        onClick={() => setShowEmoji(v => !v)}
        className="p-2 rounded-lg hover:bg-muted/60 text-muted-foreground transition-colors"
        title="Emojis"
      >
        <Smile className="w-5 h-5" />
      </button>

      {/* Sticker Gallery */}
      <button
        type="button"
        onClick={openStickerGallery}
        className="p-2 rounded-lg hover:bg-muted/60 text-muted-foreground transition-colors"
        title="Galeria de figurinhas"
      >
        <Sticker className="w-5 h-5" />
      </button>

      {/* Audio Library */}
      <button
        type="button"
        onClick={openAudioGallery}
        className="p-2 rounded-lg hover:bg-muted/60 text-muted-foreground transition-colors"
        title="Áudios salvos"
      >
        <Library className="w-5 h-5" />
      </button>

      {/* Audio Recorder */}
      {!recording && !uploadingAudio && (
        <button
          type="button"
          onClick={startRecording}
          className="p-2 rounded-lg hover:bg-muted/60 text-muted-foreground transition-colors"
          title="Gravar áudio"
        >
          <Mic className="w-5 h-5" />
        </button>
      )}
      {uploadingAudio && (
        <div className="flex items-center gap-2 px-2 py-1 text-xs text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Salvando áudio...
        </div>
      )}
      {recording && (
        <div className="flex items-center gap-2 px-2 py-1 rounded-lg bg-destructive/10 border border-destructive/30">
          <span className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
          <span className="text-xs font-mono text-destructive">{fmt(seconds)}</span>
          <button
            type="button"
            onClick={() => stopRecording(true)}
            className="p-1 rounded hover:bg-destructive/20 text-destructive"
            title="Cancelar"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => stopRecording(false)}
            className="p-1 rounded hover:bg-destructive/20 text-destructive"
            title="Parar e enviar"
          >
            <Square className="w-3.5 h-3.5 fill-current" />
          </button>
        </div>
      )}

      {/* Emoji Picker */}
      {showEmoji && (
        <div className="absolute bottom-12 left-0 z-50 shadow-2xl rounded-lg overflow-hidden">
          <EmojiPicker
            theme={Theme.DARK}
            emojiStyle={EmojiStyle.NATIVE}
            onEmojiClick={(e) => {
              onInsertText(e.emoji);
              setShowEmoji(false);
            }}
            width={320}
            height={380}
          />
        </div>
      )}

      {/* Sticker Gallery Dialog */}
      <Dialog open={showStickers} onOpenChange={setShowStickers}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sticker className="w-5 h-5" /> Figurinhas
            </DialogTitle>
            <p className="text-xs text-muted-foreground">Escolha uma figurinha ou adicione uma nova</p>
          </DialogHeader>

          <div className="flex justify-end mb-2">
            <button
              type="button"
              onClick={() => stickerUploadRef.current?.click()}
              disabled={uploadingSticker}
              className="px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-medium flex items-center gap-1.5 hover:bg-primary/90 disabled:opacity-60"
            >
              {uploadingSticker ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              Adicionar figurinha
            </button>
            <input
              ref={stickerUploadRef}
              type="file"
              className="hidden"
              accept="image/webp,image/png,image/gif,image/jpeg"
              onChange={handleStickerUpload}
            />
          </div>

          <div className="max-h-[420px] overflow-y-auto scrollbar-thin">
            {loadingLib ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin" />
              </div>
            ) : stickers.length === 0 ? (
              <div className="text-center py-12 text-sm text-muted-foreground">
                Nenhuma figurinha ainda. Clique em <strong>Adicionar figurinha</strong> para enviar a primeira.
              </div>
            ) : (
              <div className="grid grid-cols-4 sm:grid-cols-5 gap-3">
                {stickers.map((s) => (
                  <div key={s.id} className="relative group rounded-lg border border-border/50 bg-muted/30 p-2 aspect-square flex items-center justify-center">
                    <img
                      src={s.url}
                      alt="figurinha"
                      className="max-w-full max-h-full object-contain cursor-pointer"
                      onClick={() => useSticker(s)}
                    />
                    <button
                      onClick={() => deleteItem(s)}
                      className="absolute top-1 right-1 p-1 rounded-full bg-destructive/80 text-destructive-foreground opacity-0 group-hover:opacity-100 transition"
                      title="Excluir"
                    >
                      <XIcon className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Audio Library Dialog */}
      <Dialog open={showAudios} onOpenChange={setShowAudios}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Library className="w-5 h-5" /> Áudios gravados
            </DialogTitle>
            <p className="text-xs text-muted-foreground">Clique em "Usar" para adicionar à mensagem</p>
          </DialogHeader>

          <div className="max-h-[420px] overflow-y-auto scrollbar-thin space-y-2">
            {loadingLib ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin" />
              </div>
            ) : audios.length === 0 ? (
              <div className="text-center py-12 text-sm text-muted-foreground">
                Nenhum áudio salvo. Clique no <Mic className="w-3.5 h-3.5 inline" /> para gravar.
              </div>
            ) : (
              audios.map((a) => (
                <div key={a.id} className="flex items-center gap-3 p-3 rounded-lg border border-border/50 bg-muted/30">
                  <audio src={a.url} controls className="flex-1 min-w-0 h-8" />
                  <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                    {a.duration_seconds ? `${a.duration_seconds}s` : ''}
                  </span>
                  <button
                    onClick={() => useAudio(a)}
                    className="px-2.5 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium flex items-center gap-1 hover:bg-primary/90"
                  >
                    <Check className="w-3 h-3" /> Usar
                  </button>
                  <button
                    onClick={() => deleteItem(a)}
                    className="p-1.5 rounded-md text-destructive hover:bg-destructive/10"
                    title="Excluir"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
