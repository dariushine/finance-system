'use client';

import { useState } from 'react';
import {
  Autocomplete,
  TextField,
  Box,
  Chip,
  Typography,
  CircularProgress,
} from '@mui/material';
import { Add as AddIcon } from '@mui/icons-material';
import type { Category } from '../lib/api';
import { useCategories, categoryLabel, isSystemCategoryName } from '../lib/hooks';

interface CategoryAutocompleteProps {
  type: 'expense' | 'income';
  value: string | null; // id de categoría (o null)
  onChange: (category: Category | null) => void;
  disabled?: boolean;
  /** Si true, permite escribir una categoría nueva que no existe aún. */
  allowCreate?: boolean;
}

/**
 * Selector de categoría con búsqueda a medida que escribes (fill-as-you-type),
 * sin necesidad de scrollear listas largas. Opcionalmente permite crear una
 * categoría nueva si lo que escribes no coincide con ninguna existente.
 */
export default function CategoryAutocomplete({
  type,
  value,
  onChange,
  disabled,
  allowCreate = true,
}: CategoryAutocompleteProps) {
  const { categories, loading, error, refetch } = useCategories(type);
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');

  // Categoría seleccionada (por id). Las de sistema se filtran en el hook.
  const selected = categories.find((c) => String(c.id) === String(value)) || null;

  // Posible "crear nueva" si el texto no coincide con ninguna categoría.
  const trimmedInput = inputValue.trim();
  const exactMatch = categories.some(
    (c) => c.name.toLowerCase() === trimmedInput.toLowerCase()
  );
  const showCreate =
    allowCreate && trimmedInput.length > 0 && !exactMatch && !isSystemCategoryName(trimmedInput);

  return (
    <Autocomplete
      open={open}
      onOpen={() => {
        // Refresca la lista cada vez que se abre: así aparecen las categorías
        // creadas al vuelo o en /categories después del primer render (el formulario
        // permanece montado en el Dialog del AddFab, así que no basta con el mount).
        setOpen(true);
        refetch();
      }}
      onClose={() => setOpen(false)}
      loading={loading}
      value={selected}
      inputValue={inputValue}
      onInputChange={(_, value) => setInputValue(value)}
      onChange={(_, newValue) => {
        // freeSolo permite strings; el valor real es Category | string | null
        if (newValue === null) {
          onChange(null);
          return;
        }
        if (typeof newValue === 'string') {
          // Texto libre (solo si permite crear)
          if (allowCreate && newValue.trim()) {
            const created: Category = {
              id: -1,
              name: newValue.trim(),
              type,
              color: type === 'income' ? '#2ecc71' : '#e74c3c',
            };
            onChange(created);
          }
          return;
        }
        // Objeto Category existente
        onChange(newValue);
      }}
      isOptionEqualToValue={(option, val) =>
        Boolean(option && val) && String(option.id) === String((val as Category).id)
      }
      getOptionLabel={(option) =>
        typeof option === 'string' ? option : categoryLabel(option.name)
      }
      freeSolo={allowCreate}
      autoSelect={false}
      renderOption={(props, option) => (
        <Box component="li" {...props} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box
            sx={{
              width: 12,
              height: 12,
              borderRadius: '50%',
              bgcolor: option.color || '#999',
              flexShrink: 0,
            }}
          />
          {categoryLabel(option.name)}
          {option.id === -1 && (
            <Chip size="small" icon={<AddIcon />} label="Nueva" color="primary" variant="outlined" sx={{ ml: 'auto' }} />
          )}
        </Box>
      )}
      renderInput={(params) => (
        <TextField
          {...params}
          label="Categoría"
          required
          placeholder="Escribe para buscar…"
          error={!loading && !!error}
          helperText={error || (showCreate ? `Pulsa para crear "${trimmedInput}"` : undefined)}
          InputProps={{
            ...params.InputProps,
            endAdornment: (
              <>
                {loading ? <CircularProgress color="inherit" size={20} /> : null}
                {params.InputProps.endAdornment}
              </>
            ),
          }}
        />
      )}
      options={showCreate
        ? [
            ...categories,
            { id: -1, name: trimmedInput, type, color: type === 'income' ? '#2ecc71' : '#e74c3c' },
          ]
        : categories}
      disabled={disabled || loading === false && !!error}
    />
  );
}
