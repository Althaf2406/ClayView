import { ClayType } from "./KilnShrinkageEngine";

export interface PieceRecord {
  readonly pieceNumber: number;
  readonly clayType: ClayType;
  readonly matchPercentage: number;
  readonly maxDeviationMm: number;
  readonly timestampMs: number;
}

export class SeriesConsistencyTracker {
  private readonly history: PieceRecord[] = [];
  private targetSeriesCount: number;

  constructor(targetSeriesCount: number = 6) {
    if (targetSeriesCount < 1) {
      throw new Error("Target series count must be at least 1.");
    }
    this.targetSeriesCount = targetSeriesCount;
  }

  public setTargetSeriesCount(count: number): void {
    if (count < 1) {
      throw new Error("Target series count must be at least 1.");
    }
    this.targetSeriesCount = count;
  }

  public recordPiece(
    matchPercentage: number,
    maxDeviationMm: number,
    clayType: ClayType,
    timestampMs: number = Date.now()
  ): PieceRecord {
    const pieceNumber = this.history.length + 1;
    const record: PieceRecord = {
      pieceNumber,
      clayType,
      matchPercentage,
      maxDeviationMm,
      timestampMs,
    };
    this.history.push(record);
    return record;
  }

  public getCurrentPieceNumber(): number {
    return this.history.length + 1;
  }

  public getSavedCount(): number {
    return this.history.length;
  }

  public getTargetSeriesCount(): number {
    return this.targetSeriesCount;
  }

  public getCounterLabel(): string {
    return `Piece ${this.getCurrentPieceNumber()} of ${this.targetSeriesCount}`;
  }

  public getAverageMatchPercentage(): number {
    if (this.history.length === 0) return 0;
    const sum = this.history.reduce((acc, item) => acc + item.matchPercentage, 0);
    return Math.round(sum / this.history.length);
  }

  public getHistory(): readonly PieceRecord[] {
    return [...this.history];
  }
}
