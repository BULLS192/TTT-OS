-- CRM/ERP live operations: Realtime coverage, operational indexes, and atomic PO receipt.

do $$
declare
  t text;
begin
  foreach t in array array[
    'companies','contacts','leads','opportunities','activities','vendors',
    'products_services','supplier_products','inventory_items','purchase_orders','purchase_order_lines',
    'quotes','quote_lines','invoices','invoice_lines','payments','appointments',
    'shop_resources','service_templates','scheduling_technicians','work_operations',
    'warranties','scheduling_settings'
  ]
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname='supabase_realtime' and schemaname='public' and tablename=t
    ) then
      execute format('alter publication supabase_realtime add table public.%I',t);
    end if;
  end loop;
end $$;

create index if not exists products_services_org_brand_category_idx
  on public.products_services(organization_id,brand,category)
  where archived_at is null and active=true;
create index if not exists products_services_org_dealer_sku_idx
  on public.products_services(organization_id,dealer_sku)
  where archived_at is null;
create index if not exists inventory_items_org_sku_idx
  on public.inventory_items(organization_id,sku)
  where archived_at is null;
create index if not exists inventory_items_org_location_idx
  on public.inventory_items(organization_id,location)
  where archived_at is null;
create index if not exists purchase_orders_org_status_expected_idx
  on public.purchase_orders(organization_id,status,expected_date)
  where archived_at is null;
create index if not exists vendors_org_status_idx
  on public.vendors(organization_id,vendor_status)
  where archived_at is null;

create index if not exists supplier_products_org_product_idx
  on public.supplier_products(organization_id,product_id)
  where archived_at is null;
create index if not exists supplier_products_org_vendor_idx
  on public.supplier_products(organization_id,vendor_company_id)
  where archived_at is null;
create index if not exists supplier_products_org_dealer_sku_idx
  on public.supplier_products(organization_id,dealer_sku)
  where archived_at is null;

create or replace function public.receive_purchase_order(
  p_organization_id uuid,
  p_purchase_order_id text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_po public.purchase_orders%rowtype;
  v_line record;
  v_inventory_id text;
  v_on_hand numeric;
  v_average_cost numeric;
  v_receive_qty numeric;
  v_new_average numeric;
  v_received_lines integer := 0;
begin
  select *
  into v_po
  from public.purchase_orders
  where organization_id=p_organization_id
    and id=p_purchase_order_id
    and archived_at is null
  for update;

  if not found then
    raise exception 'Purchase order not found or not accessible';
  end if;

  if lower(v_po.status) in ('received','cancelled','closed') then
    raise exception 'Purchase order status % cannot be received', v_po.status;
  end if;

  for v_line in
    select l.*, p.ttt_sku
    from public.purchase_order_lines l
    left join public.products_services p
      on p.organization_id=l.organization_id and p.id=l.product_id
    where l.organization_id=p_organization_id
      and l.purchase_order_id=p_purchase_order_id
      and l.archived_at is null
    order by l.sort_order,l.id
    for update of l
  loop
    v_receive_qty := greatest(coalesce(v_line.quantity,0)-coalesce(v_line.received_quantity,0),0);
    if v_receive_qty <= 0 or v_line.product_id is null then
      continue;
    end if;

    select id,quantity_on_hand,average_cost
    into v_inventory_id,v_on_hand,v_average_cost
    from public.inventory_items
    where organization_id=p_organization_id
      and product_id=v_line.product_id
      and location='Main Shop'
      and archived_at is null
    order by created_at
    limit 1
    for update;

    if found then
      if coalesce(v_on_hand,0)+v_receive_qty > 0 then
        v_new_average :=
          ((coalesce(v_on_hand,0)*coalesce(v_average_cost,v_line.unit_cost,0)) +
           (v_receive_qty*coalesce(v_line.unit_cost,0)))
          / (coalesce(v_on_hand,0)+v_receive_qty);
      else
        v_new_average := coalesce(v_line.unit_cost,v_average_cost,0);
      end if;

      update public.inventory_items
      set quantity_on_hand=coalesce(quantity_on_hand,0)+v_receive_qty,
          average_cost=v_new_average,
          last_counted_at=now(),
          updated_at=now(),
          updated_by=auth.uid()
      where organization_id=p_organization_id and id=v_inventory_id;
    else
      insert into public.inventory_items(
        organization_id,product_id,sku,location,quantity_on_hand,quantity_reserved,
        average_cost,last_counted_at,metadata,created_by,updated_by
      ) values (
        p_organization_id,v_line.product_id,v_line.ttt_sku,'Main Shop',v_receive_qty,0,
        coalesce(v_line.unit_cost,0),now(),
        jsonb_build_object('created_from_purchase_order',p_purchase_order_id),
        auth.uid(),auth.uid()
      );
    end if;

    update public.purchase_order_lines
    set received_quantity=quantity,updated_at=now()
    where organization_id=p_organization_id and id=v_line.id;

    v_received_lines := v_received_lines+1;
  end loop;

  update public.purchase_orders
  set status='received',
      received_date=current_date,
      updated_at=now(),
      updated_by=auth.uid()
  where organization_id=p_organization_id and id=p_purchase_order_id;

  return jsonb_build_object(
    'purchase_order_id',p_purchase_order_id,
    'received_lines',v_received_lines,
    'status','received'
  );
end;
$$;

revoke all on function public.receive_purchase_order(uuid,text) from public,anon;
grant execute on function public.receive_purchase_order(uuid,text) to authenticated;


-- Inventory ledger support for manual stock adjustments and PO receipts.
create index if not exists inventory_transactions_org_item_idx
  on public.inventory_transactions(organization_id,inventory_item_id,occurred_at desc);
create index if not exists inventory_transactions_org_product_idx
  on public.inventory_transactions(organization_id,product_id,occurred_at desc);
create index if not exists inventory_transactions_org_po_idx
  on public.inventory_transactions(organization_id,purchase_order_id)
  where purchase_order_id is not null;

create or replace function public.adjust_inventory_item(
  p_organization_id uuid,
  p_product_id text,
  p_inventory_item_id text default null,
  p_location text default 'Main Shop',
  p_quantity_on_hand numeric default 0,
  p_quantity_reserved numeric default 0,
  p_average_cost numeric default null,
  p_reorder_point numeric default null,
  p_reorder_quantity numeric default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security invoker
set search_path=public
as $$
declare
  v_id text;
  v_old_qty numeric := 0;
  v_delta numeric := 0;
  v_product_sku text;
begin
  select ttt_sku into v_product_sku
  from public.products_services
  where organization_id=p_organization_id and id=p_product_id and archived_at is null;

  if v_product_sku is null and not exists(
    select 1 from public.products_services
    where organization_id=p_organization_id and id=p_product_id and archived_at is null
  ) then raise exception 'Product not found or not accessible'; end if;

  if p_inventory_item_id is not null and p_inventory_item_id<>'' then
    select id,quantity_on_hand into v_id,v_old_qty
    from public.inventory_items
    where organization_id=p_organization_id and id=p_inventory_item_id and archived_at is null
    for update;
  else
    select id,quantity_on_hand into v_id,v_old_qty
    from public.inventory_items
    where organization_id=p_organization_id and product_id=p_product_id
      and location=coalesce(nullif(p_location,''),'Main Shop') and archived_at is null
    order by created_at limit 1 for update;
  end if;

  if v_id is null then
    insert into public.inventory_items(
      organization_id,product_id,sku,location,quantity_on_hand,quantity_reserved,
      reorder_point,reorder_quantity,average_cost,last_counted_at,notes,created_by,updated_by
    ) values (
      p_organization_id,p_product_id,v_product_sku,coalesce(nullif(p_location,''),'Main Shop'),
      greatest(coalesce(p_quantity_on_hand,0),0),greatest(coalesce(p_quantity_reserved,0),0),
      p_reorder_point,p_reorder_quantity,p_average_cost,now(),p_notes,auth.uid(),auth.uid()
    ) returning id into v_id;
    v_delta:=greatest(coalesce(p_quantity_on_hand,0),0);
  else
    v_delta:=greatest(coalesce(p_quantity_on_hand,0),0)-coalesce(v_old_qty,0);
    update public.inventory_items
    set location=coalesce(nullif(p_location,''),location),
        quantity_on_hand=greatest(coalesce(p_quantity_on_hand,0),0),
        quantity_reserved=greatest(coalesce(p_quantity_reserved,0),0),
        reorder_point=p_reorder_point,reorder_quantity=p_reorder_quantity,
        average_cost=p_average_cost,last_counted_at=now(),notes=p_notes,
        updated_at=now(),updated_by=auth.uid()
    where organization_id=p_organization_id and id=v_id;
  end if;

  if v_delta<>0 then
    insert into public.inventory_transactions(
      organization_id,inventory_item_id,product_id,transaction_type,quantity,unit_cost,
      reference,notes,created_by
    ) values (
      p_organization_id,v_id,p_product_id,'adjustment',v_delta,p_average_cost,
      'TTT OS stock adjustment',p_notes,auth.uid()
    );
  end if;

  return jsonb_build_object('inventory_item_id',v_id,'quantity_delta',v_delta,
    'quantity_on_hand',greatest(coalesce(p_quantity_on_hand,0),0));
end;
$$;

revoke all on function public.adjust_inventory_item(uuid,text,text,text,numeric,numeric,numeric,numeric,numeric,text) from public,anon;
grant execute on function public.adjust_inventory_item(uuid,text,text,text,numeric,numeric,numeric,numeric,numeric,text) to authenticated;

-- Replace the earlier PO receiver with the ledger-aware version.
create or replace function public.receive_purchase_order(
  p_organization_id uuid,
  p_purchase_order_id text
)
returns jsonb
language plpgsql
security invoker
set search_path=public
as $$
declare
  v_po public.purchase_orders%rowtype;
  v_line record;
  v_inventory_id text;
  v_on_hand numeric;
  v_average_cost numeric;
  v_receive_qty numeric;
  v_new_average numeric;
  v_received_lines integer:=0;
begin
  select * into v_po from public.purchase_orders
  where organization_id=p_organization_id and id=p_purchase_order_id and archived_at is null
  for update;
  if not found then raise exception 'Purchase order not found or not accessible'; end if;
  if lower(v_po.status) in ('received','cancelled','closed') then
    raise exception 'Purchase order status % cannot be received',v_po.status;
  end if;

  for v_line in
    select l.*,p.ttt_sku
    from public.purchase_order_lines l
    left join public.products_services p
      on p.organization_id=l.organization_id and p.id=l.product_id
    where l.organization_id=p_organization_id
      and l.purchase_order_id=p_purchase_order_id
      and l.archived_at is null
    order by l.sort_order,l.id
    for update of l
  loop
    v_receive_qty:=greatest(coalesce(v_line.quantity,0)-coalesce(v_line.received_quantity,0),0);
    if v_receive_qty<=0 or v_line.product_id is null then continue; end if;

    v_inventory_id:=null;v_on_hand:=0;v_average_cost:=null;
    select id,quantity_on_hand,average_cost into v_inventory_id,v_on_hand,v_average_cost
    from public.inventory_items
    where organization_id=p_organization_id and product_id=v_line.product_id
      and location='Main Shop' and archived_at is null
    order by created_at limit 1 for update;

    if v_inventory_id is not null then
      v_new_average:=case when coalesce(v_on_hand,0)+v_receive_qty>0
        then ((coalesce(v_on_hand,0)*coalesce(v_average_cost,v_line.unit_cost,0))+
              (v_receive_qty*coalesce(v_line.unit_cost,0)))/(coalesce(v_on_hand,0)+v_receive_qty)
        else coalesce(v_line.unit_cost,v_average_cost,0) end;
      update public.inventory_items
      set quantity_on_hand=coalesce(quantity_on_hand,0)+v_receive_qty,
          average_cost=v_new_average,last_counted_at=now(),updated_at=now(),updated_by=auth.uid()
      where organization_id=p_organization_id and id=v_inventory_id;
    else
      insert into public.inventory_items(
        organization_id,product_id,sku,location,quantity_on_hand,quantity_reserved,
        average_cost,last_counted_at,metadata,created_by,updated_by
      ) values (
        p_organization_id,v_line.product_id,v_line.ttt_sku,'Main Shop',v_receive_qty,0,
        coalesce(v_line.unit_cost,0),now(),
        jsonb_build_object('created_from_purchase_order',p_purchase_order_id),auth.uid(),auth.uid()
      ) returning id into v_inventory_id;
    end if;

    insert into public.inventory_transactions(
      organization_id,inventory_item_id,product_id,transaction_type,quantity,unit_cost,
      job_id,purchase_order_id,reference,notes,created_by
    ) values (
      p_organization_id,v_inventory_id,v_line.product_id,'receipt',v_receive_qty,v_line.unit_cost,
      v_po.job_id,p_purchase_order_id,'PO receipt '||p_purchase_order_id,v_po.notes,auth.uid()
    );

    update public.purchase_order_lines set received_quantity=quantity,updated_at=now()
    where organization_id=p_organization_id and id=v_line.id;
    v_received_lines:=v_received_lines+1;
  end loop;

  update public.purchase_orders
  set status='received',received_date=current_date,updated_at=now(),updated_by=auth.uid()
  where organization_id=p_organization_id and id=p_purchase_order_id;

  return jsonb_build_object('purchase_order_id',p_purchase_order_id,
    'received_lines',v_received_lines,'status','received');
end;
$$;

revoke all on function public.receive_purchase_order(uuid,text) from public,anon;
grant execute on function public.receive_purchase_order(uuid,text) to authenticated;
