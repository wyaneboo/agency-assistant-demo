grant delete on public.cases to authenticated;
grant delete on public.claims to authenticated;
grant delete on public.tasks to authenticated;

create policy "Authenticated users can delete cases"
on public.cases for delete
to authenticated
using ((select auth.uid()) is not null);

create policy "Authenticated users can delete claims"
on public.claims for delete
to authenticated
using ((select auth.uid()) is not null);

create policy "Authenticated users can delete tasks"
on public.tasks for delete
to authenticated
using ((select auth.uid()) is not null);
