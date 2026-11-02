import type {
  RoutineHistoryItem,
  RoutineHistoryRepository,
} from '../ports/routine-history.repository';

export class GetRoutineHistoryUseCase {
  constructor(private readonly repository: RoutineHistoryRepository) {}

  execute(query: { studentId: string }): Promise<RoutineHistoryItem[]> {
    return this.repository.listByStudent(query.studentId);
  }
}
