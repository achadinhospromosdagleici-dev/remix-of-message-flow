import React, { useState, useMemo, useEffect } from 'react';
import { useWizard } from '@/contexts/WizardContext';
import { validatePhoneNumber, cleanPhoneValue, columnLooksLikePhone } from '@/utils/phoneValidation';
import { autoMatchColumn, saveMappingHistory } from '@/utils/mappingStorage';
import {
  Search, Filter, Trash2, CheckCircle2, AlertCircle, Edit3, Check, X,
  ChevronDown, MoreHorizontal, Phone, Sparkles, EyeOff, Eye,
  RotateCcw, Save,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';

type FilterType = 'all' | 'valid' | 'invalid';

interface MappingOption {
  value: string;
  label: string;
  icon: string;
  description: string;
  native: boolean;
  separator?: boolean;
}

// Native mapping options (fixed)
const NATIVE_MAPPING_OPTIONS: MappingOption[] = [
  { value: 'numero', label: 'Telefone *', icon: '📱', description: 'Número principal (obrigatório)', native: true },
  { value: 'nome', label: 'Nome', icon: '👤', description: 'Nome do contato', native: true },
  { value: 'email', label: 'Email', icon: '📧', description: 'Endereço de email', native: true },
  { value: 'cpf', label: 'CPF', icon: '🪪', description: 'Documento CPF', native: true },
  { value: 'empresa', label: 'Empresa', icon: '🏢', description: 'Nome da empresa', native: true },
  { value: 'cidade', label: 'Cidade', icon: '📍', description: 'Cidade/localidade', native: true },
  { value: 'custom', label: 'Campo Personalizado', icon: '🏷️', description: 'Atributo customizado', native: true },
  { value: '_skip', label: 'Não importar', icon: '⛔', description: 'Ignorar esta coluna', native: true },
] as const;

// Create dynamic mapping options based on spreadsheet columns
function createMappingOptions(spreadsheetColumns: string[]): MappingOption[] {
  // Get column names that are NOT in native options (new columns from spreadsheet)
  const nativeValues = NATIVE_MAPPING_OPTIONS.map(o => o.value);
  const dynamicColumns = spreadsheetColumns.filter(col => !nativeValues.includes(col));

  // Create options for dynamic columns with their original names
  const dynamicOptions = dynamicColumns.map(col => ({
    value: col,
    label: col.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
    icon: '📋',
    description: `Coluna: ${col}`,
    native: false,
  }));

  // Return native options + separator + dynamic options
  return [
    ...NATIVE_MAPPING_OPTIONS,
    ...(dynamicOptions.length > 0 ? [{ value: '_separator_', label: '---', icon: '', description: '', native: true, separator: true }] : []),
    ...dynamicOptions,
  ];
}

// Get current mapping options based on columns (defined inside component after columns is available)

function getMappingStyle(value: string) {
  const styles: Record<string, string> = {
    numero: 'bg-primary/15 border-primary/40 text-primary',
    nome: 'bg-blue-500/15 border-blue-500/40 text-blue-400',
    email: 'bg-purple-500/15 border-purple-500/40 text-purple-400',
    cpf: 'bg-amber-500/15 border-amber-500/40 text-amber-400',
    empresa: 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400',
    cidade: 'bg-cyan-500/15 border-cyan-500/40 text-cyan-400',
    custom: 'bg-foreground/10 border-foreground/20 text-foreground',
    _skip: 'bg-muted/50 border-muted-foreground/20 text-muted-foreground opacity-60',
  };
  return styles[value] || styles.custom;
}

export function StepDataReview() {
  const { data, columns, setColumns, setData, updateRow, deleteRow, deleteRows, settings, setSettings } = useWizard();
  const [filter, setFilter] = useState<FilterType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [skippedRows, setSkippedRows] = useState<Set<string>>(new Set());
  const [editingRow, setEditingRow] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [mappingApplied, setMappingApplied] = useState(false);
  const [addDDI, setAddDDI] = useState(false);

  // Auto-match columns on mount
  const [columnMapping, setColumnMapping] = useState<Record<number, string>>(() => {
    const mapping: Record<number, string> = {};
    let hasNumero = false;

    // First pass: auto-match by name (localStorage + rules)
    columns.forEach((col, i) => {
      const autoMatch = autoMatchColumn(col);
      if (autoMatch) {
        if (autoMatch === 'numero' && hasNumero) {
          mapping[i] = 'custom';
        } else {
          mapping[i] = autoMatch;
          if (autoMatch === 'numero') hasNumero = true;
        }
      } else {
        mapping[i] = '_skip';
      }
    });

    // Second pass: if no numero found, detect by data content
    if (!hasNumero) {
      columns.forEach((col, i) => {
        if (mapping[i] !== '_skip') return;
        const colValues = data.map(row => String(row[col] || ''));
        if (columnLooksLikePhone(colValues)) {
          mapping[i] = 'numero';
          hasNumero = true;
        }
      });
    }

    return mapping;
  });

  // Get mapping options based on current columns
  const getMappingOptions = () => createMappingOptions(columns);
  
  const [autoMatchedCols, setAutoMatchedCols] = useState<Set<number>>(() => {
    const matched = new Set<number>();
    columns.forEach((col, i) => {
      if (autoMatchColumn(col)) matched.add(i);
    });
    return matched;
  });

  const originalColumns = columns;

  const hasNumeroMapped = Object.values(columnMapping).includes('numero');

  const handleMappingChange = (colIndex: number, value: string) => {
    setColumnMapping(prev => {
      const newMapping = { ...prev };
      if (value === 'numero') {
        Object.keys(newMapping).forEach(key => {
          if (newMapping[Number(key)] === 'numero') newMapping[Number(key)] = '_skip';
        });
      }
      newMapping[colIndex] = value;
      return newMapping;
    });
    setMappingApplied(false);
  };

  const applyMapping = () => {
    // Save mapping history to localStorage
    const historyEntries: Record<string, string> = {};
    originalColumns.forEach((col, i) => {
      historyEntries[col] = columnMapping[i] || '_skip';
    });
    saveMappingHistory(historyEntries);

    // Build rename map
    const colRenameMap: Record<string, string> = {};
    const newColumns: string[] = [];
    originalColumns.forEach((col, i) => {
      const mapped = columnMapping[i] || '_skip';
      const newName = mapped === '_skip' ? col : mapped;
      colRenameMap[col] = newName;
      newColumns.push(newName);
    });

    // Identify phone columns
    const phoneOriginalCols: string[] = [];
    originalColumns.forEach((col, i) => {
      const mapped = columnMapping[i];
      if (mapped === 'numero' || mapped === 'custom') {
        phoneOriginalCols.push(col);
      }
    });
    originalColumns.forEach((col, i) => {
      if (!phoneOriginalCols.includes(col) && columnMapping[i] !== '_skip') {
        const colValues = data.map(row => String(row[col] || ''));
        if (columnLooksLikePhone(colValues)) phoneOriginalCols.push(col);
      }
    });

    // Remove skipped rows and empty rows
    const activeData = (Array.isArray(data) ? data : []).filter(row => {
      if (skippedRows.has(row.id)) return false;
      // Check if row has any non-empty value in mapped columns
      return (originalColumns || []).some((col, i) => {
        if (columnMapping[i] === '_skip') return false;
        const val = String(row[col] || '').trim();
        return val !== '';
      });
    });

    // Remap data
    const updatedData = activeData.map(row => {
      const newRow: Record<string, string | boolean | undefined> = {
        id: row.id, numero: '', isValid: false,
      };

      originalColumns.forEach(col => {
        const newKey = colRenameMap[col];
        let value = String(row[col] || '');
        if (phoneOriginalCols.includes(col) && value) value = cleanPhoneValue(value);
        newRow[newKey] = value;
      });

      let phone = String(newRow.numero || '');
      phone = cleanPhoneValue(phone);
      if (addDDI && phone && !phone.startsWith('55')) phone = '55' + phone;
      const validation = validatePhoneNumber(phone, !addDDI);
      newRow.numero = validation.formatted;
      newRow.isValid = validation.isValid;
      newRow.errorMessage = validation.errorMessage;

      return newRow as typeof row;
    });

    setColumns(newColumns);
    setData(updatedData);
    setMappingApplied(true);
    setSkippedRows(new Set());
    toast.success(`Mapeamento aplicado! ${updatedData.length} contatos processados.`);
  };

  // Auto-apply mapping on mount if not already applied
  useEffect(() => {
    if (!mappingApplied && hasNumeroMapped && data.length > 0) {
      applyMapping();
    }
  }, [mappingApplied, hasNumeroMapped, data.length]);

  const getMappingOption = (colIndex: number) => {
    const value = columnMapping[colIndex] || '_skip';
    return getMappingOptions().find(o => o.value === value) || getMappingOptions()[getMappingOptions().length - 1];
  };

  // Preview what a phone value will look like after cleaning
  const previewPhoneClean = (value: string, colIndex: number) => {
    if (columnMapping[colIndex] !== 'numero') return value;
    if (!value) return value;
    let cleaned = cleanPhoneValue(value);
    if (addDDI && cleaned && !cleaned.startsWith('55')) cleaned = '55' + cleaned;
    return cleaned;
  };

  const filteredData = useMemo(() => {
    let result = data;
    if (!Array.isArray(result)) return [];
    if (filter === 'valid') result = result.filter(row => row.isValid);
    else if (filter === 'invalid') result = result.filter(row => !row.isValid);
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(row =>
        (columns || []).some(col => {
          const value = row[col];
          return typeof value === 'string' && value.toLowerCase().includes(query);
        })
      );
    }
    return result;
  }, [data, filter, searchQuery, columns]);

  const validCount = Array.isArray(data) ? data.filter(r => r.isValid).length : 0;
  const invalidCount = Array.isArray(data) ? data.filter(r => !r.isValid).length : 0;

  const handleSelectAll = () => {
    if (selectedRows.size === filteredData.length) setSelectedRows(new Set());
    else setSelectedRows(new Set(filteredData.map(row => row.id)));
  };

  const handleSelectRow = (id: string) => {
    const newSelected = new Set(selectedRows);
    if (newSelected.has(id)) newSelected.delete(id);
    else newSelected.add(id);
    setSelectedRows(newSelected);
  };

  const toggleSkipRow = (id: string) => {
    const newSkipped = new Set(skippedRows);
    if (newSkipped.has(id)) newSkipped.delete(id);
    else newSkipped.add(id);
    setSkippedRows(newSkipped);
  };

  const handleDeleteSelected = () => {
    if (selectedRows.size === 0) return;
    deleteRows(Array.from(selectedRows));
    setSelectedRows(new Set());
    toast.success(`${selectedRows.size} registros removidos`);
  };

  const handleDeleteInvalid = () => {
    const invalidIds = (Array.isArray(data) ? data : []).filter(row => !row.isValid).map(row => row.id);
    deleteRows(invalidIds);
    toast.success(`${invalidIds.length} registros inválidos removidos`);
  };

  const handleClearData = () => {
    setData([]);
    setColumns(['numero']);
    setSelectedRows(new Set());
    setSkippedRows(new Set());
    toast.success('Dados limpos');
  };

  const startEditing = (row: typeof data[0]) => {
    setEditingRow(row.id);
    const values: Record<string, string> = {};
    columns.forEach(col => { values[col] = (row[col] as string) || ''; });
    setEditValues(values);
  };

  const saveEditing = () => {
    if (!editingRow) return;
    const phoneValidation = validatePhoneNumber(editValues.numero || '');
    updateRow(editingRow, {
      ...editValues,
      numero: phoneValidation.formatted,
      isValid: phoneValidation.isValid,
      errorMessage: phoneValidation.errorMessage,
    });
    setEditingRow(null);
    setEditValues({});
    toast.success('Registro atualizado');
  };

  const cancelEditing = () => {
    setEditingRow(null);
    setEditValues({});
  };

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Mapeamento de Colunas</h2>
          <p className="text-sm text-muted-foreground">
            Selecione o campo correspondente para cada coluna da planilha
          </p>
        </div>
        <div className="flex items-center gap-3">
          {autoMatchedCols.size > 0 && (
            <Badge variant="outline" className="gap-1 border-primary/30 text-primary text-xs">
              <Sparkles className="w-3 h-3" />
              {autoMatchedCols.size} auto-detectadas
            </Badge>
          )}
        </div>
      </div>

      {/* Mapping Controls Bar */}
      <div className="glass-card p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox checked={addDDI} onCheckedChange={checked => { setAddDDI(checked === true); setMappingApplied(false); }} />
              <span className="text-muted-foreground">Inserir DDI 55</span>
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox
                checked={settings.hasHeader}
                onCheckedChange={checked => setSettings({ hasHeader: checked === true })}
              />
              <span className="text-muted-foreground">1ª linha é cabeçalho</span>
            </label>
          </div>


        </div>

        {!hasNumeroMapped && (
          <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 px-3 py-2 rounded-lg">
            <AlertCircle className="w-3.5 h-3.5" />
            Selecione qual coluna contém o número de telefone (campo obrigatório)
          </div>
        )}

        {skippedRows.size > 0 && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 px-3 py-2 rounded-lg">
            <EyeOff className="w-3.5 h-3.5" />
            {skippedRows.size} linhas marcadas para ignorar
          </div>
        )}
      </div>

      {/* Stats + Actions Bar */}
      <div className="glass-card p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="text-center">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Total</p>
              <p className="text-2xl font-bold">{data.length}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Válidos</p>
              <p className="text-2xl font-bold text-success">{validCount}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Inválidos</p>
              <p className="text-2xl font-bold text-destructive">{invalidCount}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Buscar..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-9 pr-4 py-2 rounded-lg bg-muted/50 border border-border/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 w-48"
              />
            </div>

            <div className="flex bg-muted/50 rounded-lg p-1">
              {(['all', 'valid', 'invalid'] as FilterType[]).map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    filter === f ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {f === 'all' ? 'Todos' : f === 'valid' ? 'Válidos' : 'Inválidos'}
                </button>
              ))}
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50 border border-border/50 text-sm hover:bg-muted transition-colors">
                Ações
                <ChevronDown className="w-4 h-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {selectedRows.size > 0 && (
                  <DropdownMenuItem onClick={handleDeleteSelected} className="text-destructive">
                    <Trash2 className="w-4 h-4 mr-2" />
                    Excluir Selecionados ({selectedRows.size})
                  </DropdownMenuItem>
                )}
                {invalidCount > 0 && (
                  <DropdownMenuItem onClick={handleDeleteInvalid} className="text-destructive">
                    <AlertCircle className="w-4 h-4 mr-2" />
                    Remover Inválidos ({invalidCount})
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={handleClearData} className="text-destructive">
                  <Trash2 className="w-4 h-4 mr-2" />
                  Limpar Tudo
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* Data Table with Column Mapping */}
      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto scrollbar-thin max-h-[500px]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10">
              {/* Mapping Row */}
              <tr className="border-b border-border/50 bg-card/95 backdrop-blur-sm">
                <th className="py-3 px-4 w-10" />
                <th className="py-3 px-2 w-12" />
                <th className="py-3 px-2 w-14 text-xs text-muted-foreground text-center font-medium">#</th>
                {columns.map((col, colIndex) => {
                  const option = getMappingOption(colIndex);
                  const isAutoMatched = autoMatchedCols.has(colIndex);
                  return (
                    <th key={`mapping-${colIndex}`} className="py-3 px-2">
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium w-full justify-between transition-all duration-200 hover:scale-[1.02] ${getMappingStyle(option.value)}`}
                        >
                          <span className="flex items-center gap-1.5 truncate">
                            <span>{option.icon}</span>
                            <span className="truncate">{option.label}</span>
                            {isAutoMatched && (
                              <Sparkles className="w-3 h-3 text-primary flex-shrink-0" />
                            )}
                          </span>
                          <ChevronDown className="w-3 h-3 flex-shrink-0 opacity-60" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-56 max-h-96 overflow-y-auto">
                          {getMappingOptions().map((opt, idx) => (
                            opt.separator ? (
                              <DropdownMenuSeparator key={`sep-${idx}`} className="my-1" />
                            ) : (
                            <DropdownMenuItem
                              key={opt.value}
                              onClick={() => handleMappingChange(colIndex, opt.value)}
                              className={`flex flex-col items-start gap-0.5 ${columnMapping[colIndex] === opt.value ? 'bg-primary/10' : ''}`}
                            >
                              <span className="flex items-center gap-2 text-sm">
                                <span>{opt.icon}</span>
                                {opt.label}
                              </span>
                              <span className="text-xs text-muted-foreground pl-6">{opt.description}</span>
                            </DropdownMenuItem>
                            )
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </th>
                  );
                })}
                <th className="py-3 px-4 w-16" />
              </tr>
              {/* Original Column Names Row */}
              <tr className="border-b border-border/50 bg-muted/30">
                <th className="text-left py-2 px-4">
                  <Checkbox
                    checked={selectedRows.size === filteredData.length && filteredData.length > 0}
                    onCheckedChange={handleSelectAll}
                  />
                </th>
                <th className="py-2 px-2 text-xs text-muted-foreground">
                  <EyeOff className="w-3.5 h-3.5 mx-auto opacity-50" />
                </th>
                <th className="py-2 px-2 w-14 text-xs text-muted-foreground text-center">ID</th>
                {columns.map((col, colIndex) => (
                  <th key={col} className="text-left py-2 px-4 font-mono text-xs text-muted-foreground uppercase">
                    <span className="flex items-center gap-1.5">
                      {columnMapping[colIndex] === 'numero' && (
                        <Phone className="w-3 h-3 text-primary" />
                      )}
                      {col}
                    </span>
                  </th>
                ))}
                <th className="text-right py-2 px-4 text-xs text-muted-foreground">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredData.map((row, rowIndex) => {
                const isSkipped = skippedRows.has(row.id);
                return (
                  <tr
                    key={row.id}
                    className={`border-b border-border/30 transition-colors ${
                      isSkipped
                        ? 'opacity-40 bg-muted/20 line-through'
                        : !row.isValid
                          ? 'bg-destructive/5 hover:bg-destructive/10'
                          : 'hover:bg-muted/30'
                    } ${selectedRows.has(row.id) ? 'bg-primary/5' : ''}`}
                  >
                    <td className="py-3 px-4">
                      <Checkbox
                        checked={selectedRows.has(row.id)}
                        onCheckedChange={() => handleSelectRow(row.id)}
                      />
                    </td>
                    <td className="py-3 px-2 text-center">
                      <button
                        onClick={() => toggleSkipRow(row.id)}
                        className={`p-1 rounded transition-colors ${
                          isSkipped
                            ? 'text-muted-foreground hover:text-foreground'
                            : 'text-muted-foreground/40 hover:text-muted-foreground'
                        }`}
                        title={isSkipped ? 'Incluir linha' : 'Ignorar linha'}
                      >
                        {isSkipped ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                      </button>
                    </td>
                    <td className="py-3 px-2 text-center text-xs text-muted-foreground font-mono">
                      {rowIndex + 1}
                    </td>
                    {columns.map((col, colIndex) => {
                      const rawValue = (row[col] as string) || '';
                      const isNumeroCol = columnMapping[colIndex] === 'numero';
                      const displayValue = isNumeroCol
                        ? previewPhoneClean(rawValue, colIndex)
                        : rawValue;

                      return (
                        <td key={col} className="py-3 px-4">
                          {editingRow === row.id ? (
                            <input
                              type="text"
                              value={editValues[col] || ''}
                              onChange={e => setEditValues({ ...editValues, [col]: e.target.value })}
                              className={`w-full px-2 py-1 rounded bg-muted border border-border/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 ${
                                isNumeroCol ? 'font-mono' : ''
                              }`}
                            />
                          ) : isNumeroCol ? (
                            <span className="font-mono text-primary">
                              {displayValue}
                              {rawValue !== displayValue && (
                                <span className="ml-1.5 text-xs text-muted-foreground line-through">{rawValue}</span>
                              )}
                            </span>
                          ) : columnMapping[colIndex] === '_skip' ? (
                            <span className="text-muted-foreground/50">{rawValue || '-'}</span>
                          ) : (
                            <span className="text-foreground/80">{rawValue || '-'}</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="py-3 px-4 text-right">
                      {editingRow === row.id ? (
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={saveEditing} className="p-1.5 rounded-md bg-success/10 text-success hover:bg-success/20 transition-colors">
                            <Check className="w-4 h-4" />
                          </button>
                          <button onClick={cancelEditing} className="p-1.5 rounded-md bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors">
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <DropdownMenu>
                          <DropdownMenuTrigger className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground">
                            <MoreHorizontal className="w-4 h-4" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => startEditing(row)}>
                              <Edit3 className="w-4 h-4 mr-2" />
                              Editar
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => toggleSkipRow(row.id)}>
                              {isSkipped ? <Eye className="w-4 h-4 mr-2" /> : <EyeOff className="w-4 h-4 mr-2" />}
                              {isSkipped ? 'Incluir' : 'Ignorar'}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => { deleteRow(row.id); toast.success('Registro removido'); }}
                              className="text-destructive"
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              Excluir
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {filteredData.length === 0 && (
          <div className="py-12 text-center text-muted-foreground">
            <AlertCircle className="w-8 h-8 mx-auto mb-3 opacity-50" />
            <p>Nenhum registro encontrado</p>
          </div>
        )}
      </div>
    </div>
  );
}
