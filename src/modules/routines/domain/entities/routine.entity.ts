export interface RoutineProps {
  id: string;
  studentId: string;
  routineType: string;
  targetWeeklyFrequency: number;
  state: string;
  origin: string;
  startDate: Date;
  currentVersionNumber?: number;
}

export class Routine {
  readonly id: string;
  readonly studentId: string;
  readonly routineType: string;
  readonly targetWeeklyFrequency: number;
  readonly state: string;
  readonly origin: string;
  readonly startDate: Date;
  readonly currentVersionNumber?: number;

  constructor(props: RoutineProps) {
    this.id = props.id;
    this.studentId = props.studentId;
    this.routineType = props.routineType;
    this.targetWeeklyFrequency = props.targetWeeklyFrequency;
    this.state = props.state;
    this.origin = props.origin;
    this.startDate = props.startDate;
    this.currentVersionNumber = props.currentVersionNumber;
  }

  isVigente(): boolean {
    return this.state === 'VIGENTE';
  }
}

