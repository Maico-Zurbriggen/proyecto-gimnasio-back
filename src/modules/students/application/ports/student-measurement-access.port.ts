import type { MeasurementBlockState } from '../../domain/services/student-block';

export interface StudentMeasurementAccess {
  findActiveBlockState(
    studentId: string,
  ): Promise<MeasurementBlockState | null>;
}
