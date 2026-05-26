import React, { useState, useCallback, useEffect } from 'react';
import { useWizard, DataRow } from '@/contexts/WizardContext';
import { validatePhoneNumber, parseCSVLine, detectDelimiter } from '@/utils/phoneValidation';
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle2, Table, FileText, ListOrdered, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { generateId } from '@/lib/id';
import { SpreadsheetPasteArea } from '../SpreadsheetPasteArea';

export function StepDataEntry() {
  const { setData, setColumns, data, columns, settings, setSettings, nextStep } = useWizard();
  const [pasteData, setPasteData] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [showPasteArea, setShowPasteArea] = useState(false);

  // NÃO auto-ocultar - área só fecha quando usuário clica em Processar ou Fechar


  const processData = useCallback((text: string, hasHeader: boolean = true) => {
    const lines = text.trim().split('\n').filter(line => line.trim());
    
    if (lines.length === 0) {
      toast.error('Nenhum dado encontrado');
      return;
    }

    const delimiter = detectDelimiter(text);
    const headerLine = parseCSVLine(lines[0], delimiter);
    
    // Se tem cabeçalho, os dados reais começam na linha 2 (índice 1)
    const dataLines = hasHeader ? lines.slice(1) : lines;
    
    const rows: any[] = dataLines.map(line => {
      const values = parseCSVLine(line, delimiter);
      const row: any = {
        id: generateId(),
        numero: '',
        isValid: false
      };
      headerLine.forEach((col, i) => {
        row[col] = values[i] || '';
      });

      // Se a coluna 'numero' existir, validar
      if (row.numero) {
        const validation = validatePhoneNumber(row.numero, true);
        row.isValid = validation.isValid;
        row.numero = validation.formatted;
        row.errorMessage = validation.errorMessage;
      }

      return row;
    });

    setData(rows);
    setColumns(headerLine);
    toast.success(`${rows.length} registros processados.`);
  }, [setData, setColumns]);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (text) {
        setPasteData(text);
        processData(text, settings.hasHeader);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }, [processData, settings.hasHeader]);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        if (text) {
          setPasteData(text);
          processData(text, settings.hasHeader);
        }
      };
      reader.readAsText(file);
    }
  }, [processData, settings.hasHeader]);

  return (
    <div className="space-y-4">
      {/* Toggle between paste areas */}
      {!showPasteArea && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Textarea paste area */}
          <div 
            className={`relative border-2 border-dashed rounded-xl p-4 transition-all cursor-pointer ${
              isDragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
            }`}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => setShowPasteArea(true)}
          >
            <div className="text-center space-y-2">
              <Table className="w-8 h-8 mx-auto text-muted-foreground" />
              <div className="font-medium">Planilha</div>
              <p className="text-xs text-muted-foreground">Cole ou arraste dados no formato de planilha</p>
            </div>
          </div>

          {/* Textarea paste area (simple) */}
          <div 
            className={`relative border-2 border-dashed rounded-xl p-4 transition-all cursor-pointer ${
              isDragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
            }`}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              const file = e.dataTransfer.files?.[0];
              if (file && (file.type === 'text/plain' || file.name.endsWith('.csv') || file.name.endsWith('.txt'))) {
                const reader = new FileReader();
                reader.onload = (event) => {
                  const text = event.target?.result as string;
                  if (text) {
                    setPasteData(text);
                    processData(text);
                  }
                };
                reader.readAsText(file);
              }
            }}
          >
            <div className="text-center space-y-2">
              <FileText className="w-8 h-8 mx-auto text-muted-foreground" />
              <div className="font-medium">Texto simples</div>
              <p className="text-xs text-muted-foreground">Cole dados de texto delimitados</p>
            </div>
          </div>

          {/* File upload */}
          <label className="relative border-2 border-dashed rounded-xl p-4 transition-all cursor-pointer hover:border-primary/50 block">
            <input 
              type="file" 
              accept=".csv,.txt,.xls,.xlsx"
              onChange={handleFileUpload}
              className="hidden"
            />
            <div className="text-center space-y-2">
              <Upload className="w-8 h-8 mx-auto text-muted-foreground" />
              <div className="font-medium">Upload</div>
              <p className="text-xs text-muted-foreground">Envie um arquivo CSV ou TXT</p>
            </div>
          </label>
        </div>
      )}

      {/* Show paste area when toggled */}
      {showPasteArea && (
        <div className="relative">
          <div className="flex justify-between items-center mb-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-success" />
              <span className="text-sm">Cole dados da planilha (Ctrl+V)</span>
            </div>
            <button
              onClick={() => setShowPasteArea(false)}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              ✕ Fechar
            </button>
          </div>
          
          <SpreadsheetPasteArea 
            onDataPaste={(text) => {
              setPasteData(text);
              processData(text, settings.hasHeader);
            }}
            onProcess={() => {
              if (typeof nextStep === 'function') {
                nextStep();
              } else {
                console.error('[StepDataEntry] nextStep is not a function from useWizard');
                toast.error('Erro ao avançar de etapa. Tente novamente.');
              }
            }}
          />

          {data.length > 0 && (
            <div className="flex items-center gap-2 text-sm text-success bg-success/10 px-4 py-2 rounded-lg">
              <CheckCircle2 className="w-4 h-4" />
              <span>Dados carregados! Clique em <strong>Processar Dados</strong> para mapear.</span>
            </div>
          )}
        </div>
      )}

      {/* Instructions - Collapsible */}
      {data.length === 0 && !showPasteArea && (
        <div className="p-4 bg-muted/50 rounded-lg space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <AlertCircle className="w-4 h-4" />
            Como importar dados:
          </div>
          <ul className="text-xs text-muted-foreground space-y-1 ml-6 list-disc">
            <li>Escolha uma das opções acima (Planilha, Texto Simples ou Upload)</li>
            <li>Cole ou arraste dados no formato: <strong>telefone, nome, empresa...</strong></li>
            <li>A primeira linha será usada como cabeçalho</li>
            <li>O sistema detectará automaticamente números de telefone</li>
          </ul>
        </div>
      )}

      {/* Show current data summary when we have data */}
      {(data.length > 0 && !showPasteArea) && (
        <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-sm text-success">
              <CheckCircle2 className="w-5 h-5" />
              <span className="font-medium">{data.length} contatos</span>
            </div>
            <div className="text-sm text-muted-foreground">
              {columns.length} colunas
            </div>
          </div>
          <button
            onClick={() => setShowPasteArea(true)}
            className="flex items-center gap-1 text-sm text-primary hover:text-primary/80"
          >
            <Plus className="w-4 h-4" />
            Adicionar mais
          </button>
        </div>
      )}

      {/* Format options */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={settings.hasHeader}
            onChange={(e) => setSettings({ hasHeader: e.target.checked })}
            className="rounded border-border"
          />
          Primeira linha é cabeçalho
        </label>
      </div>
    </div>
  );
}