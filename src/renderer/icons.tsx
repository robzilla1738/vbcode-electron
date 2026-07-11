import type { LucideProps } from "lucide-react";
import {
  Archive,
  ArrowUp,
  Brain,
  ChevronRight,
  CornerUpLeft,
  FileText,
  Folder,
  FolderOpen,
  LayoutDashboard,
  MoreVertical,
  Paperclip,
  PanelLeft,
  PanelRight,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Square,
  Terminal,
  Trash2,
  X,
} from "lucide-react";

/** Shared Lucide stroke defaults — OpenCode-like thin chrome icons. */
export type IconProps = {
  className?: string;
  size?: number;
  strokeWidth?: number;
};

const DEFAULTS = { size: 14, strokeWidth: 1.5, "aria-hidden": true as const };

function lucide(props: IconProps): LucideProps {
  return {
    ...DEFAULTS,
    ...props,
  };
}

export function IconPlus(props: IconProps) {
  return <Plus {...lucide(props)} />;
}

export function IconFolder(props: IconProps) {
  return <Folder {...lucide(props)} />;
}

export function IconFolderOpen(props: IconProps) {
  return <FolderOpen {...lucide(props)} />;
}

export function IconContinue(props: IconProps) {
  return <RotateCcw {...lucide(props)} />;
}

export function IconSearch(props: IconProps) {
  return <Search {...lucide(props)} />;
}

export function IconChevronLeft(props: IconProps) {
  return <ChevronRight {...lucide(props)} style={{ transform: "rotate(180deg)" }} />;
}

export function IconChevron({ open, className, size = 14 }: IconProps & { open?: boolean }) {
  return (
    <ChevronRight
      {...lucide({ size, className: `icon-chevron${open ? " is-open" : ""}${className ? ` ${className}` : ""}` })}
    />
  );
}

export function IconFile(props: IconProps) {
  return <FileText {...lucide(props)} />;
}

export function IconCommand(props: IconProps) {
  return <Terminal {...lucide(props)} />;
}

export function IconPaperclip(props: IconProps) {
  return <Paperclip {...lucide(props)} />;
}

export function IconSend(props: IconProps) {
  return <ArrowUp {...lucide({ size: 16, ...props })} />;
}

export function IconStop(props: IconProps) {
  return <Square {...lucide({ size: 11, strokeWidth: 0, ...props })} fill="currentColor" />;
}

export function IconJobs(props: IconProps) {
  return <LayoutDashboard {...lucide(props)} />;
}

export function IconSidebar(props: IconProps) {
  return <PanelLeft {...lucide(props)} />;
}

export function IconMore(props: IconProps) {
  return <MoreVertical {...lucide(props)} />;
}

export function IconPanel(props: IconProps) {
  return <PanelRight {...lucide(props)} />;
}

export function IconBrain(props: IconProps) {
  return <Brain {...lucide(props)} />;
}

export function IconSteer(props: IconProps) {
  return <CornerUpLeft {...lucide(props)} />;
}

export function IconRemove(props: IconProps) {
  return <X {...lucide(props)} />;
}

export function IconRename(props: IconProps) {
  return <Pencil {...lucide(props)} />;
}

export function IconArchive(props: IconProps) {
  return <Archive {...lucide(props)} />;
}

export function IconDelete(props: IconProps) {
  return <Trash2 {...lucide(props)} />;
}
