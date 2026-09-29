-- Fails on every combination of the columns that appears more than once
{% test unique_columns(model, columns) %}

select {{ columns | join(', ') }}, count(*) as n
from {{ model }}
group by {{ columns | join(', ') }}
having count(*) > 1

{% endtest %}
