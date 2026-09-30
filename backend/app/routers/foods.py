from datetime import datetime
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import FoodItem, Zone, ActivityHistory, User
from app.schemas import FoodItemCreate, FoodItemUpdate, FoodItemOut
from app.security import get_current_user

router = APIRouter(prefix="/foods", tags=["Food Management"])

def serialize_food(item: FoodItem) -> dict:
    now = datetime.utcnow()
    diff = item.expiry_date - now
    days_left = int(diff.total_seconds() // 86400)
    
    return {
        "id": item.id,
        "user_id": item.user_id,
        "name": item.name,
        "category": item.category,
        "item_type": item.item_type,
        "zone_id": item.zone_id,
        "zone_name": item.zone.name if item.zone else "Unknown",
        "zone_code": item.zone.code if item.zone else "unknown",
        "quantity": item.quantity,
        "unit": item.unit,
        "added_at": item.added_at,
        "expiry_date": item.expiry_date,
        "freshness_status": item.freshness_status,
        "barcode": item.barcode,
        "brand": item.brand,
        "image_path": item.image_path,
        "source": item.source,
        "is_used": item.is_used,
        "is_discarded": item.is_discarded,
        "estimated_cost": item.estimated_cost or 0.0,
        "notes": item.notes,
        "days_until_expiry": days_left
    }

@router.get("", response_model=List[FoodItemOut])
def get_foods(
    zone_id: Optional[int] = None,
    status: Optional[str] = None,
    item_type: Optional[str] = None,
    search: Optional[str] = None,
    sort_by: str = Query("expiry_date", pattern="^(expiry_date|added_at|name)$"),
    sort_order: str = Query("asc", pattern="^(asc|desc)$"),
    skip: int = 0,
    limit: int = 100,
    include_used: bool = False,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    query = db.query(FoodItem).filter(FoodItem.user_id == current_user.id)
    if not include_used:
        query = query.filter(FoodItem.is_used == False, FoodItem.is_discarded == False)

    if zone_id:
        query = query.filter(FoodItem.zone_id == zone_id)
    if status:
        query = query.filter(FoodItem.freshness_status.ilike(f"%{status}%"))
    if item_type:
        query = query.filter(FoodItem.item_type == item_type)
    if search:
        query = query.filter(
            (FoodItem.name.ilike(f"%{search}%")) |
            (FoodItem.brand.ilike(f"%{search}%")) |
            (FoodItem.category.ilike(f"%{search}%"))
        )

    # Sorting
    order_col = getattr(FoodItem, sort_by)
    if sort_order == "desc":
        order_col = order_col.desc()
    query = query.order_by(order_col)

    items = query.offset(skip).limit(limit).all()
    return [serialize_food(item) for item in items]

@router.post("", response_model=FoodItemOut)
def create_food(
    food_in: FoodItemCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Verify zone exists
    zone = db.query(Zone).filter(Zone.id == food_in.zone_id).first()
    if not zone:
        raise HTTPException(status_code=400, detail="Invalid zone_id specified")

    new_item = FoodItem(
        user_id=current_user.id,
        name=food_in.name,
        category=food_in.category,
        item_type=food_in.item_type,
        zone_id=food_in.zone_id,
        quantity=food_in.quantity,
        unit=food_in.unit,
        added_at=datetime.utcnow(),
        expiry_date=food_in.expiry_date,
        freshness_status=food_in.freshness_status,
        barcode=food_in.barcode,
        brand=food_in.brand,
        image_path=food_in.image_path,
        source=food_in.source,
        estimated_cost=food_in.estimated_cost or 0.0,
        notes=food_in.notes
    )
    db.add(new_item)
    db.commit()
    db.refresh(new_item)

    # Record Activity History
    activity = ActivityHistory(
        user_id=current_user.id,
        action="added",
        food_item_name=new_item.name,
        quantity=new_item.quantity,
        unit=new_item.unit,
        estimated_cost=new_item.estimated_cost,
        timestamp=datetime.utcnow()
    )
    db.add(activity)
    db.commit()

    return serialize_food(new_item)

@router.get("/{food_id}", response_model=FoodItemOut)
def get_food(food_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    item = db.query(FoodItem).filter(FoodItem.id == food_id, FoodItem.user_id == current_user.id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Food item not found")
    return serialize_food(item)

@router.put("/{food_id}", response_model=FoodItemOut)
def update_food(
    food_id: int,
    food_in: FoodItemUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    item = db.query(FoodItem).filter(FoodItem.id == food_id, FoodItem.user_id == current_user.id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Food item not found")

    update_data = food_in.dict(exclude_unset=True)
    for field, val in update_data.items():
        setattr(item, field, val)

    db.commit()
    db.refresh(item)
    return serialize_food(item)

@router.delete("/{food_id}")
def delete_food(food_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    item = db.query(FoodItem).filter(FoodItem.id == food_id, FoodItem.user_id == current_user.id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Food item not found")

    db.delete(item)
    db.commit()
    return {"message": f"Food item {food_id} deleted successfully"}

@router.post("/{food_id}/use", response_model=FoodItemOut)
def mark_food_used(
    food_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    item = db.query(FoodItem).filter(FoodItem.id == food_id, FoodItem.user_id == current_user.id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Food item not found")

    item.is_used = True
    db.commit()

    # Log activity
    db.add(ActivityHistory(
        user_id=current_user.id,
        action="used",
        food_item_name=item.name,
        quantity=item.quantity,
        unit=item.unit,
        estimated_cost=item.estimated_cost,
        timestamp=datetime.utcnow()
    ))
    db.commit()
    db.refresh(item)
    return serialize_food(item)

@router.post("/{food_id}/discard", response_model=FoodItemOut)
def mark_food_discarded(
    food_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    item = db.query(FoodItem).filter(FoodItem.id == food_id, FoodItem.user_id == current_user.id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Food item not found")

    item.is_discarded = True
    db.commit()

    # Log activity
    db.add(ActivityHistory(
        user_id=current_user.id,
        action="discarded",
        food_item_name=item.name,
        quantity=item.quantity,
        unit=item.unit,
        estimated_cost=item.estimated_cost,
        timestamp=datetime.utcnow()
    ))
    db.commit()
    db.refresh(item)
    return serialize_food(item)
