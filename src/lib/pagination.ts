export const DEFAULT_PAGE_SIZE = 50;
export const PAGE_SIZE_OPTIONS = ['50', '100', '200', 'all'] as const;

export type PageSizeOption = (typeof PAGE_SIZE_OPTIONS)[number];

export type PaginatedItems<Item> = {
  currentPage: number;
  from: number;
  items: Item[];
  pageSize: number;
  to: number;
  totalItems: number;
  totalPages: number;
};

export function getPageSizeOption(value: string | undefined): PageSizeOption {
  return PAGE_SIZE_OPTIONS.includes(value as PageSizeOption) ? (value as PageSizeOption) : String(DEFAULT_PAGE_SIZE) as PageSizeOption;
}

export function paginateItems<Item>(
  items: Item[],
  pageValue: string | undefined,
  pageSizeValue?: string
): PaginatedItems<Item> {
  const pageSizeOption = getPageSizeOption(pageSizeValue);
  const pageSize = pageSizeOption === 'all' ? Math.max(items.length, 1) : Number(pageSizeOption);
  const parsedPage = Number.parseInt(pageValue || '1', 10);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const currentPage = Math.min(Math.max(Number.isFinite(parsedPage) ? parsedPage : 1, 1), totalPages);
  const start = (currentPage - 1) * pageSize;
  const pageItems = items.slice(start, start + pageSize);

  return {
    currentPage,
    from: items.length === 0 ? 0 : start + 1,
    items: pageItems,
    pageSize,
    to: start + pageItems.length,
    totalItems: items.length,
    totalPages
  };
}
