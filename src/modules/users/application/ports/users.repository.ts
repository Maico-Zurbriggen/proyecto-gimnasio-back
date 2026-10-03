import type { User } from '../../domain/entities/user.entity';

export interface UsersRepository {
  findById(id: string): Promise<User | null>;
  save(user: User): Promise<void>;
}
