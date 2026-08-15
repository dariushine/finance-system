'use client';

import { useState } from 'react';
import { Card, CardContent, Typography, TextField, Button, Box, MenuItem, Select, FormControl, InputLabel } from '@mui/material';
import { Add, Remove } from '@mui/icons-material';

export default function TransactionForm() {
  const [type, setType] = useState<'expense' | 'income'>('expense');
  const [amount, setAmount] = useState('');
  const [wallet, setWallet] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');

  const wallets = [
    { id: 1, name: 'Cuenta Bancaria USD', currency: 'USD' },
    { id: 2, name: 'Cuenta Bancaria VES', currency: 'VES' },
    { id: 3, name: 'Efectivo USD', currency: 'USD' },
    { id: 4, name: 'Efectivo VES', currency: 'VES' },
    { id: 5, name: 'Crypto Wallet', currency: 'USD' },
    { id: 6, name: 'Tarjeta Prepagada', currency: 'USD' },
  ];

  const categories = {
    expense: ['food', 'transport', 'housing', 'utilities', 'entertainment', 'health', 'shopping'],
    income: ['salary', 'freelance', 'investment', 'gift', 'other'],
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log('Transacción:', { type, amount, wallet, category, description });
    
    // Reset form
    setAmount('');
    setWallet('');
    setCategory('');
    setDescription('');
    
    alert('Transacción registrada exitosamente');
  };

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          {type === 'expense' ? '📤 Registrar Gasto' : '📥 Registrar Ingreso'}
        </Typography>
        
        <Box display="flex" gap={1} mb={2}>
          <Button
            variant={type === 'expense' ? 'contained' : 'outlined'}
            startIcon={<Remove />}
            onClick={() => setType('expense')}
            color="error"
            fullWidth
          >
            Gasto
          </Button>
          <Button
            variant={type === 'income' ? 'contained' : 'outlined'}
            startIcon={<Add />}
            onClick={() => setType('income')}
            color="success"
            fullWidth
          >
            Ingreso
          </Button>
        </Box>

        <form onSubmit={handleSubmit}>
          <Box display="flex" flexDirection="column" gap={2}>
            <TextField
              label="Monto"
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Ej: 1200"
              required
              InputProps={{
                endAdornment: wallet ? (
                  wallets.find(w => w.name === wallet)?.currency || ''
                ) : 'USD/VES'
              }}
            />

            <FormControl fullWidth required>
              <InputLabel>Billetera</InputLabel>
              <Select
                value={wallet}
                label="Billetera"
                onChange={(e) => setWallet(e.target.value)}
              >
                {wallets.map((w) => (
                  <MenuItem key={w.id} value={w.name}>
                    {w.name} ({w.currency})
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl fullWidth required>
              <InputLabel>Categoría</InputLabel>
              <Select
                value={category}
                label="Categoría"
                onChange={(e) => setCategory(e.target.value)}
              >
                {categories[type].map((cat) => (
                  <MenuItem key={cat} value={cat}>
                    {cat.charAt(0).toUpperCase() + cat.slice(1)}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <TextField
              label="Descripción"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ej: Perro caliente"
              multiline
              rows={2}
            />

            <Button
              type="submit"
              variant="contained"
              color={type === 'expense' ? 'error' : 'success'}
              size="large"
              fullWidth
              startIcon={type === 'expense' ? <Remove /> : <Add />}
            >
              {type === 'expense' ? 'Registrar Gasto' : 'Registrar Ingreso'}
            </Button>
          </Box>
        </form>

        <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: 'block' }}>
          💡 El currency se obtiene automáticamente de la billetera seleccionada
        </Typography>
      </CardContent>
    </Card>
  );
}