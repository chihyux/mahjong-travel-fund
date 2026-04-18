import Modal from './Modal';
import Button, { type ButtonVariant } from './Button';

interface ConfirmDialogProps {
  open: boolean;
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  variant?: ButtonVariant;
}

export default function ConfirmDialog({
  open,
  title = '確認',
  message,
  confirmText = '確定',
  cancelText = '取消',
  onConfirm,
  onCancel,
  variant = 'danger'
}: ConfirmDialogProps) {
  return (
    <Modal open={open} title={title} onClose={onCancel} size="sm">
      <p className="text-[18px] leading-relaxed text-ink mb-6">{message}</p>
      <div className="grid grid-cols-2 gap-3">
        <Button variant="secondary" size="md" onClick={onCancel}>
          {cancelText}
        </Button>
        <Button variant={variant} size="md" onClick={onConfirm}>
          {confirmText}
        </Button>
      </div>
    </Modal>
  );
}
