export interface ExpiredCycleDto {
  routineId: string;
  studentId: string;
  routineType: string;
  cycleStart: string;
  dueDate: string;
  daysOverdue: number;
  measurementDates: string[];
  hasNewMeasurement: boolean;
  previousProposalDates: string[];
}

export interface DetectExpiredCyclesResultDto {
  evaluatedAt: string;
  expiredCycles: ExpiredCycleDto[];
}
