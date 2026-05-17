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
        className="rounded bg-sage-50 px-2 py-0.5 text-xs text-sage-600 hover:bg-sage-100"
        title={editTitle}
      >
        ✎
      </button>
      <button
        type="button"
        onClick={onDelete}
        disabled={isDeleting}
        className="rounded bg-red-50 px-2 py-0.5 text-xs text-red-600 hover:bg-red-100 disabled:opacity-50"
        title={deleteTitle}
      >
        {isDeleting ? "…" : "✕"}
      </button>
    </div>
  );
}
