import type { CarnetView } from '../../../server/src/contract.ts';
export function startCarnet(
  root: HTMLElement,
  opts: {
    view: CarnetView;
    isAdmin: boolean;
    notice?: string;
    save: (p: { code: string }) => Promise<unknown>;
    onLogout: () => void;
    onSecurity: () => void;
    onAdmin: () => void;
  },
): () => void;
