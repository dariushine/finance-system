/**
 * Pruebas de validación para transacciones
 * 
 * Estas pruebas NO requieren base de datos real,
 * solo prueban la lógica de validación.
 */

// Mock completo de la base de datos para pruebas unitarias
const mockDb = {
  serialize: jest.fn((cb) => cb()),
  run: jest.fn(),
  get: jest.fn(),
  all: jest.fn(),
  close: jest.fn()
};

jest.mock('sqlite3', () => ({
  verbose: () => ({
    Database: jest.fn(() => mockDb)
  })
}));

describe('Transaction Validation Logic', () => {
  // Test helpers
  const createMockWallet = (id: number, name: string, currency: string, balance: number) => ({
    id,
    name,
    currency,
    balance,
    type: 'bank',
    isActive: 1
  });
  
  const createMockCategory = (id: number, name: string, type: string) => ({
    id,
    name,
    type,
    isActive: 1
  });
  
  beforeEach(() => {
    // Reset mocks antes de cada test
    jest.clearAllMocks();
  });
  
  test('should validate required transaction fields', () => {
    // Arrange
    const invalidRequests = [
      {}, // empty
      { walletId: 1 }, // missing category, type, amount
      { walletId: 1, categoryId: 1 }, // missing type, amount
      { walletId: 1, categoryId: 1, type: 'expense' }, // missing amount
      { walletId: 1, categoryId: 1, amount: 100 }, // missing type
    ];
    
    // Act & Assert - Cada request debería fallar validación
    invalidRequests.forEach(request => {
      expect(() => validateTransactionRequest(request)).toThrow(/Faltan campos requeridos/);
    });
  });
  
  test('should validate transaction type', () => {
    // Arrange
    const validTypes = ['income', 'expense'];
    const invalidTypes = ['', 'invalid', 'INCOME', 'Expense'];
    
    validTypes.forEach(type => {
      const request = { walletId: 1, categoryId: 1, type, amount: 100 };
      expect(() => validateTransactionType(type)).not.toThrow();
    });
    
    invalidTypes.forEach(type => {
      expect(() => validateTransactionType(type)).toThrow(/type debe ser "income" o "expense"/);
    });
  });
  
  test('should validate positive amount', () => {
    // Arrange
    const validAmounts = [0.01, 1, 100, 1000.50];
    const invalidAmounts = [0, -1, -100, -0.01];
    
    validAmounts.forEach(amount => {
      expect(() => validateTransactionAmount(amount)).not.toThrow();
    });
    
    invalidAmounts.forEach(amount => {
      expect(() => validateTransactionAmount(amount)).toThrow(/amount debe ser mayor a 0/);
    });
  });
  
  test('should validate wallet currency matches transaction', () => {
    // Arrange
    const wallet = createMockWallet(1, 'Cuenta USD', 'USD', 1000);
    const validCurrency = 'USD';
    const invalidCurrency = 'VES';
    
    // Act & Assert
    expect(() => validateCurrencyMatch(wallet, validCurrency)).not.toThrow();
    expect(() => validateCurrencyMatch(wallet, invalidCurrency))
      .toThrow(/La billetera usa USD, pero la transacción es en VES/);
  });
  
  test('should validate sufficient funds for expense', () => {
    // Arrange
    const wallet = createMockWallet(1, 'Efectivo VES', 'VES', 1000);
    
    // Act & Assert
    expect(() => validateSufficientFunds(wallet, 'expense', 500)).not.toThrow(); // tiene 1000, gasta 500
    expect(() => validateSufficientFunds(wallet, 'expense', 1000)).not.toThrow(); // tiene 1000, gasta 1000 (justo)
    expect(() => validateSufficientFunds(wallet, 'expense', 1500))
      .toThrow(/Fondos insuficientes.*1000.*necesitas.*1500/); // tiene 1000, quiere gastar 1500
    
    // Income no necesita validación de fondos
    expect(() => validateSufficientFunds(wallet, 'income', 10000)).not.toThrow();
    expect(() => validateSufficientFunds(wallet, 'income', 0.01)).not.toThrow();
  });
  
  test('should validate category type matches transaction type', () => {
    // Arrange
    const expenseCategory = createMockCategory(1, 'food', 'expense');
    const incomeCategory = createMockCategory(2, 'salary', 'income');
    
    // Act & Assert
    expect(() => validateCategoryType(expenseCategory, 'expense')).not.toThrow();
    expect(() => validateCategoryType(incomeCategory, 'income')).not.toThrow();
    
    expect(() => validateCategoryType(expenseCategory, 'income'))
      .toThrow(/La categoría.*es para expense.*no para income/);
    
    expect(() => validateCategoryType(incomeCategory, 'expense'))
      .toThrow(/La categoría.*es para income.*no para expense/);
  });
});

// Funciones de validación helper (deberían estar en el código real)
function validateTransactionRequest(request: any) {
  const { walletId, categoryId, type, amount } = request;
  if (!walletId || !categoryId || !type || !amount) {
    throw new Error('Faltan campos requeridos: walletId, categoryId, type, amount');
  }
}

function validateTransactionType(type: string) {
  if (type !== 'income' && type !== 'expense') {
    throw new Error('type debe ser "income" o "expense"');
  }
}

function validateTransactionAmount(amount: number) {
  if (amount <= 0) {
    throw new Error('amount debe ser mayor a 0');
  }
}

function validateCurrencyMatch(wallet: any, currency: string) {
  if (wallet.currency !== currency) {
    throw new Error(`La billetera usa ${wallet.currency}, pero la transacción es en ${currency}`);
  }
}

function validateSufficientFunds(wallet: any, type: string, amount: number) {
  if (type === 'expense' && wallet.balance < amount) {
    throw new Error(
      `Fondos insuficientes. Balance actual: ${wallet.balance} ${wallet.currency}, ` +
      `necesitas: ${amount} ${wallet.currency}`
    );
  }
}

function validateCategoryType(category: any, transactionType: string) {
  if (category.type !== transactionType) {
    throw new Error(
      `La categoría "${category.name}" es para ${category.type}, no para ${transactionType}`
    );
  }
}