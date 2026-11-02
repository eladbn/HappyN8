import { createContext, useContext } from 'react';
import type { N8nNode, NodeProperty, Params } from '../../api/types';

export interface MappingField {
  node: string;
  path: string;
  expr: string;
  sample: unknown;
}

export interface ParamCtx {
  node: N8nNode;
  root: Params;
  rootProps: NodeProperty[];
  fields: MappingField[];
  canLoad: boolean;
}

export const ParamContext = createContext<ParamCtx | null>(null);

export function useParamCtx(): ParamCtx {
  const c = useContext(ParamContext);
  if (!c) throw new Error('ParamContext missing');
  return c;
}

export interface FieldProps {
  prop: NodeProperty;
  value: unknown;
  onChange: (v: unknown) => void;
  /** Path of this parameter inside node.parameters, e.g. ["options", "timeout"]. */
  path: string[];
  /** Object holding this parameter and its siblings (for displayOptions). */
  parent: Params;
}
