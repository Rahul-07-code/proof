import { loadEnvConfig } from '@next/env';
import { Pool } from 'pg';

async function main() {
  loadEnvConfig(process.cwd());
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  const migrationPool = new Pool({ connectionString: process.env.MIGRATION_DATABASE_URL, max: 1 });
  let probeId: string | undefined;
  try {
    const migrations = await migrationPool.query<{ name: string }>(
      'SELECT name FROM schema_migrations ORDER BY name',
    );
    const applied = migrations.rows.map(row => row.name).join(',');
    const expected = '001_initial.sql,002_roles_recruiter_provenance.sql,003_originality_signals.sql,004_review_adjustments.sql';
    if (applied !== expected) throw new Error(`Unexpected applied migration set: ${applied || '(empty)'}.`);

    const identity = await pool.query<{ current_user: string; current_database: string }>(
      'SELECT current_user, current_database()',
    );
    if (identity.rows[0]?.current_user !== 'proof_app' || identity.rows[0]?.current_database !== 'proof_of_skill') {
      throw new Error('Runtime credentials did not connect as proof_app to proof_of_skill.');
    }

    try {
      await pool.query('SELECT name FROM schema_migrations LIMIT 1');
      throw new Error('Runtime role unexpectedly has access to migration bookkeeping.');
    } catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== '42501') throw error;
    }

    try {
      await pool.query('CREATE TABLE public.__proof_app_ddl_probe(id integer)');
      await pool.query('DROP TABLE public.__proof_app_ddl_probe');
      throw new Error('Runtime role unexpectedly has schema DDL permission.');
    } catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== '42501') throw error;
    }

    const inserted = await pool.query<{ id: string }>(
      "INSERT INTO audit_log(action,object_type,details) VALUES('verification.persistence_probe','test','{\"purpose\":\"database-connectivity\"}') RETURNING id",
    );
    probeId = inserted.rows[0]?.id;
    if (!probeId) throw new Error('Runtime role could not persist a probe row.');
  } finally {
    await pool.end();
    await migrationPool.end();
  }

  if (!probeId) throw new Error('Database write probe did not produce an id.');
  const reopenedPool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  try {
    const persisted = await reopenedPool.query<{ action: string }>(
      'SELECT action FROM audit_log WHERE id=$1', [probeId],
    );
    if (persisted.rows[0]?.action !== 'verification.persistence_probe') {
      throw new Error('Probe row was not readable from a fresh database connection.');
    }
  } finally {
    if (probeId) await reopenedPool.query('DELETE FROM audit_log WHERE id=$1', [probeId]).catch(() => undefined);
    await reopenedPool.end();
  }
  console.log('PASS: all migrations recorded; runtime login, database identity, app DML, fresh-connection persistence, migration-table denial, and DDL denial.');
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : 'Database verification failed.');
  process.exitCode = 1;
});
