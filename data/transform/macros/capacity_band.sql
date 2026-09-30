-- Capacity band of a listing, from its number of guests: listings are
-- compared on price only within the same band (see price_baselines)
{% macro capacity_band(accommodates) %}
    case
        when {{ accommodates }} is null then 'unknown'
        when {{ accommodates }} <= 2 then '1-2'
        when {{ accommodates }} <= 4 then '3-4'
        when {{ accommodates }} <= 6 then '5-6'
        else '7+'
    end
{% endmacro %}
