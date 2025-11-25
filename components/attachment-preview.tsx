import { memo } from 'react'
import { XIcon, FileIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { Attachment } from '@/types/attachment'

interface AttachmentPreviewProps {
  attachment: Attachment
  isUploading?: boolean
  onRemove?: (url: string) => void
  className?: string
}

const PureAttachmentPreview = ({ attachment, isUploading, onRemove, className }: AttachmentPreviewProps) => {
  const isImage = attachment.contentType?.startsWith('image/')
  const label = attachment.name || attachment.url.split('/').pop() || 'file'

  return (
    <div
      className={cn(
        'relative h-16 w-16',
        className
      )}
      data-testid="input-attachment-preview"
    >
      {/* Inner container with overflow hidden for content */}
      <div className="absolute inset-0 overflow-hidden rounded-lg border border-border/60 bg-muted/40 shadow-sm">
        <div className="absolute inset-0 flex items-center justify-center bg-background/30">
          {isImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={attachment.url} alt={label} className="h-full w-full object-cover" loading="lazy" />
          ) : (
            <FileIcon className="h-5 w-5 text-muted-foreground" />
          )}
        </div>

        {isUploading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-[1px]">
            <div className="flex flex-col items-center gap-1">
              <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              <span className="text-[10px] text-white/90">uploading</span>
            </div>
          </div>
        )}

        {label && !isUploading && (
          <div className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/65 to-transparent px-1 py-0.5 text-[10px] text-white">
            {label}
          </div>
        )}
      </div>

      {/* Remove button outside overflow-hidden container */}
      {onRemove && !isUploading && (
        <Button
          size="icon"
          variant="destructive"
          className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full p-0 shadow-md z-10 hover:scale-110 transition-transform"
          onClick={() => onRemove(attachment.url)}
          aria-label="Remove attachment"
        >
          <XIcon className="h-3 w-3" />
        </Button>
      )}
    </div>
  )
}

export const AttachmentPreview = memo(PureAttachmentPreview)
