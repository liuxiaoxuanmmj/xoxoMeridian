import { CloseIcon, EditIcon } from "@/components/icons";

type ItemActionsProps = {
  onEdit: () => void;
  onDelete: () => void;
  isDeleting: boolean;
  editTitle?: string;
  deleteTitle?: string;
};

export function ItemActions({
  onEdit,
  onDelete,
  isDeleting,
  editTitle = "编辑",
  deleteTitle = "删除",
}: ItemActionsProps) {
  return (
    <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition group-hover:opacity-100">
      <button
        type="button"
        onClick={onEdit}
        className="rounded-[6px] bg-[#fafbfc] px-2 py-0.5 text-xs text-[#3a5b22] transition-colors duration-200 hover:bg-[#3a5b22]/10 cursor-pointer"
        title={editTitle}
      >
        <EditIcon size={12} />
      </button>
      <button
        type="button"
        onClick={onDelete}
        disabled={isDeleting}
        className="rounded-[6px] bg-red-50 px-2 py-0.5 text-xs text-red-600 transition-colors duration-200 hover:bg-red-100 disabled:opacity-50 cursor-pointer"
        title={deleteTitle}
      >
        {isDeleting ? "…" : <CloseIcon size={12} />}
      </button>
    </div>
  );
}
