from sqlalchemy.orm import Session
from app.models import WasherCycle, WasherCyclePoint


def get_washer_cycle(db: Session, cycle_id: int):
    return (
        db.query(WasherCycle)
        .filter(WasherCycle.id == cycle_id)
        .first()
    )


def get_washer_cycle_telemetry(db: Session, cycle_id: int):
    return (
        db.query(WasherCyclePoint)
        .filter(WasherCyclePoint.washer_cycle_id == cycle_id)
        .order_by(WasherCyclePoint.recorded_at)
        .all()
    )
