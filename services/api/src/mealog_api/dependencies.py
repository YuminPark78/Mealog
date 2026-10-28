from supabase import create_client

from mealog_api.config import settings
from mealog_api.repositories.meals import MealsRepository
from mealog_api.services.meals import MealsService


def get_meals_service() -> MealsService:
    client = create_client(
        settings.supabase_url,
        settings.supabase_publishable_key,
    )

    repository = MealsRepository(client)
    return MealsService(repository)
