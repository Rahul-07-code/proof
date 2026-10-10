import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { loadEnvConfig } from '@next/env';
import { Pool } from 'pg';

async function main() {
  loadEnvConfig(process.cwd());
  const appUrl=process.env.DATABASE_URL;
  const migrationUrl=process.env.MIGRATION_DATABASE_URL??appUrl;
  if(!migrationUrl)throw new Error('DATABASE_URL or MIGRATION_DATABASE_URL must be configured.');
  const pool=new Pool({connectionString:migrationUrl});
  await pool.query('CREATE TABLE IF NOT EXISTS schema_migrations(name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  const files=(await readdir(path.join(process.cwd(),'migrations'))).filter(name=>/^\d+_[a-z0-9_]+\.sql$/i.test(name)).sort();
  for(const name of files){
    const prior=await pool.query('SELECT 1 FROM schema_migrations WHERE name=$1',[name]);
    if(prior.rowCount)continue;
    const sql=await readFile(path.join(process.cwd(),'migrations',name),'utf8');
    const client=await pool.connect();
    try{await client.query('BEGIN');await client.query(sql);await client.query('INSERT INTO schema_migrations(name) VALUES($1)',[name]);await client.query('COMMIT');console.log(`Applied ${name}`)}catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}
  }
  if(appUrl){
    const appRole=process.env.APP_DB_ROLE??decodeURIComponent(new URL(appUrl).username);
    if(!appRole)throw new Error('Set APP_DB_ROLE to grant runtime permissions.');
    const identifier=`"${appRole.replaceAll('"','""')}"`;
    const database=await pool.query('SELECT current_database() AS name');
    if(decodeURIComponent(new URL(appUrl).pathname.replace(/^\//,''))!==database.rows[0].name)throw new Error('DATABASE_URL and MIGRATION_DATABASE_URL must target the same database.');
    const dbIdentifier=`"${String(database.rows[0].name).replaceAll('"','""')}"`;
    await pool.query(`GRANT CONNECT ON DATABASE ${dbIdentifier} TO ${identifier}`);
    await pool.query(`GRANT USAGE ON SCHEMA public TO ${identifier}`);
    await pool.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO ${identifier}`);
    await pool.query(`GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO ${identifier}`);
    await pool.query(`REVOKE ALL PRIVILEGES ON TABLE schema_migrations FROM ${identifier}`);
    await pool.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO ${identifier}`);
    await pool.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE,SELECT ON SEQUENCES TO ${identifier}`);
  }
  await pool.end();
}
main().catch(error=>{console.error(error);process.exitCode=1});
