#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, Address, Env, token};

#[contracttype]
pub enum DataKey {
    Task(u32),
    TaskCounter,
}

#[contracttype]
#[derive(Clone)]
pub struct Task {
    pub client: Address,
    pub freelancer: Address,
    pub amount: i128,
    pub token: Address,
    pub is_funded: bool,
    pub is_approved: bool,
}

#[contract]
pub struct GigPayEscrow;

#[contractimpl]
impl GigPayEscrow {
    /// Initialize a task and lock the funds.
    pub fn fund_task(
        env: Env,
        client: Address,
        freelancer: Address,
        token: Address,
        amount: i128,
    ) -> u32 {
        client.require_auth();

        // Transfer tokens from client to this contract
        let client_token = token::Client::new(&env, &token);
        client_token.transfer(&client, &env.current_contract_address(), &amount);

        // Get and increment task counter
        let mut count: u32 = env.storage().instance().get(&DataKey::TaskCounter).unwrap_or(0);
        count += 1;

        let task = Task {
            client,
            freelancer,
            amount,
            token,
            is_funded: true,
            is_approved: false,
        };

        env.storage().instance().set(&DataKey::Task(count), &task);
        env.storage().instance().set(&DataKey::TaskCounter, &count);

        count
    }

    /// Approve the task and release funds to the freelancer
    pub fn approve_task(env: Env, task_id: u32) {
        let mut task: Task = env
            .storage()
            .instance()
            .get(&DataKey::Task(task_id))
            .unwrap();

        // Only the client can approve
        task.client.require_auth();

        if task.is_approved {
            panic!("Task already approved");
        }

        // Release funds to freelancer
        let token_client = token::Client::new(&env, &task.token);
        token_client.transfer(&env.current_contract_address(), &task.freelancer, &task.amount);

        task.is_approved = true;
        env.storage().instance().set(&DataKey::Task(task_id), &task);
    }

    /// Read task details from storage
    pub fn get_task(env: Env, task_id: u32) -> Task {
        env.storage()
            .instance()
            .get(&DataKey::Task(task_id))
            .unwrap()
    }
}

#[cfg(test)]
mod test;
