import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Category } from '../entities/category.entity';

@Injectable()
export class CategoryService {
  constructor(
    @InjectRepository(Category)
    private categoriesRepository: Repository<Category>,
  ) {}

  async seedInitialCategories(): Promise<Category[]> {
    const initialCategories = [
      // Gastos (expense)
      { name: 'food', type: 'expense', color: '#e74c3c', icon: 'restaurant' },
      { name: 'transport', type: 'expense', color: '#4ecdc4', icon: 'directions_car' },
      { name: 'housing', type: 'expense', color: '#45b7d1', icon: 'home' },
      { name: 'utilities', type: 'expense', color: '#ffd166', icon: 'flash_on' },
      { name: 'entertainment', type: 'expense', color: '#a663cc', icon: 'movie' },
      { name: 'health', type: 'expense', color: '#ff6b6b', icon: 'local_hospital' },
      { name: 'education', type: 'expense', color: '#1dd3b0', icon: 'school' },
      { name: 'shopping', type: 'expense', color: '#f28482', icon: 'shopping_cart' },
      { name: 'personal', type: 'expense', color: '#b8b8b8', icon: 'person' },
      { name: 'other', type: 'expense', color: '#95a5a6', icon: 'more_horiz' },
      
      // Ingresos (income)
      { name: 'salary', type: 'income', color: '#27ae60', icon: 'work' },
      { name: 'freelance', type: 'income', color: '#2ecc71', icon: 'computer' },
      { name: 'investment', type: 'income', color: '#3498db', icon: 'trending_up' },
      { name: 'gift', type: 'income', color: '#9b59b6', icon: 'card_giftcard' },
      { name: 'other', type: 'income', color: '#34495e', icon: 'more_horiz' },
    ];

    const createdCategories = [];
    for (const categoryData of initialCategories) {
      const existing = await this.categoriesRepository.findOne({
        where: { name: categoryData.name, type: categoryData.type },
      });

      if (!existing) {
        const category = this.categoriesRepository.create(categoryData);
        createdCategories.push(await this.categoriesRepository.save(category));
      }
    }

    return createdCategories;
  }

  async findAll(): Promise<Category[]> {
    return this.categoriesRepository.find({
      where: { isActive: true },
      order: { type: 'ASC', name: 'ASC' },
    });
  }

  async findByType(type: 'income' | 'expense'): Promise<Category[]> {
    return this.categoriesRepository.find({
      where: { type, isActive: true },
      order: { name: 'ASC' },
    });
  }
}