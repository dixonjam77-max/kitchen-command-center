from fastapi import Query


def pagination_params(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
):
    return {"skip": skip, "limit": limit}


def paginate(query, skip: int, limit: int):
    total = query.count()
    items = query.offset(skip).limit(limit).all()
    return {"items": items, "total": total, "skip": skip, "limit": limit}
