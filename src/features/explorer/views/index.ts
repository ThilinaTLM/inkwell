// Public view API of the explorer (reused by the library pages and the
// public shared-folder page). See collection.tsx for the common props.
//
//   <GridView    {...ExplorerViewProps} thumbSize? groupHeaders? meta? />
//   <CompactView {...ExplorerViewProps} />
//   <ListView    {...ExplorerViewProps} columns? extraColumns? sort? onSortChange? persistColumns? />
//   <ColumnsView folderId folders prepare? scope readOnly? menu? onOpen? />   (folder-tree only)
//   <BulkBar scope />                     – floating bar for multi-selection (screen 05)
//   <QuickLook items />                   – Space overlay (listens to quickLookStore)
//   ItemIcon / ItemThumb / TagPill / ItemPreview / PropertyList – visual building blocks

export { BulkBar } from "../BulkBar";
export { QuickLook } from "../QuickLook";
export { ColumnsView, type ColumnsViewProps } from "./ColumnsView";
export { CompactView } from "./CompactView";
export {
  Collection,
  type CollectionProps,
  defaultOpen,
  type ExplorerViewProps,
  type ItemState,
  itemStateClass,
  useCollection,
  useItemBindings,
  type ViewMenuConfig,
} from "./collection";
export { defaultMeta, GridView, type GridViewProps, THUMB_DIMENSIONS } from "./GridView";
export { ItemPreview, itemSubtitle, PropertyList } from "./ItemPreview";
export { ItemBadges, ItemIcon, ItemThumb, StarMark, TagPill } from "./ItemVisuals";
export { type ListColumnDef, ListView, type ListViewProps } from "./ListView";
