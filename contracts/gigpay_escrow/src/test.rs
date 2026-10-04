#![cfg(test)]

use super::*;
use soroban_sdk::{
    testutils::Address as _,
    token, Address, Env,
};

fn setup() -> (
    Env,
    GigPayEscrowClient<'static>,
    Address,
    token::Client<'static>,
    token::StellarAssetClient<'static>,
) {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(GigPayEscrow, ());
    let client = GigPayEscrowClient::new(&env, &contract_id);

    let token_admin = Address::generate(&env);
    let token_sac = env.register_stellar_asset_contract_v2(token_admin);
    let token_address = token_sac.address();
    let token_client = token::Client::new(&env, &token_address);
    let token_admin_client = token::StellarAssetClient::new(&env, &token_address);

    (env, client, token_address, token_client, token_admin_client)
}

#[test]
fn test_escrow_happy_path_lifecycle() {
    let (env, client, token_address, token_client, token_admin) = setup();

    let client_addr = Address::generate(&env);
    let freelancer_addr = Address::generate(&env);
    let amount: i128 = 500_0000000; // 500 USDC (7 decimals)

    // Mint tokens to client
    token_admin.mint(&client_addr, &amount);
    assert_eq!(token_client.balance(&client_addr), amount);
    assert_eq!(token_client.balance(&client.address), 0);

    // 1. Client funds task
    let task_id = client.fund_task(&client_addr, &freelancer_addr, &token_address, &amount);
    assert_eq!(task_id, 1);

    // Tokens are locked in escrow contract
    assert_eq!(token_client.balance(&client_addr), 0);
    assert_eq!(token_client.balance(&client.address), amount);
    assert_eq!(token_client.balance(&freelancer_addr), 0);

    // Verify task state in storage
    let task = client.get_task(&task_id);
    assert_eq!(task.client, client_addr);
    assert_eq!(task.freelancer, freelancer_addr);
    assert_eq!(task.amount, amount);
    assert_eq!(task.token, token_address);
    assert!(task.is_funded);
    assert!(!task.is_approved);

    // 2. Client approves task
    client.approve_task(&task_id);

    // Escrow contract releases tokens to freelancer
    assert_eq!(token_client.balance(&client.address), 0);
    assert_eq!(token_client.balance(&freelancer_addr), amount);

    // Verify task state updated to approved
    let approved_task = client.get_task(&task_id);
    assert!(approved_task.is_approved);
}

#[test]
#[should_panic(expected = "Task already approved")]
fn test_double_approval_panics() {
    let (env, client, token_address, _token_client, token_admin) = setup();

    let client_addr = Address::generate(&env);
    let freelancer_addr = Address::generate(&env);
    let amount: i128 = 250_0000000;

    token_admin.mint(&client_addr, &amount);
    let task_id = client.fund_task(&client_addr, &freelancer_addr, &token_address, &amount);

    // First approval succeeds
    client.approve_task(&task_id);

    // Second approval must panic
    client.approve_task(&task_id);
}

#[test]
#[should_panic]
fn test_nonexistent_task_panics() {
    let (_env, client, _token_address, _token_client, _token_admin) = setup();

    // Approving non-existent task ID 999 must panic
    client.approve_task(&999);
}

#[test]
fn test_multiple_concurrent_tasks_isolation() {
    let (env, client, token_address, token_client, token_admin) = setup();

    let client_a = Address::generate(&env);
    let client_b = Address::generate(&env);
    let freelancer_x = Address::generate(&env);
    let freelancer_y = Address::generate(&env);

    let amount_a: i128 = 100_0000000;
    let amount_b: i128 = 200_0000000;

    token_admin.mint(&client_a, &amount_a);
    token_admin.mint(&client_b, &amount_b);

    // Fund Task 1
    let id_1 = client.fund_task(&client_a, &freelancer_x, &token_address, &amount_a);
    assert_eq!(id_1, 1);

    // Fund Task 2
    let id_2 = client.fund_task(&client_b, &freelancer_y, &token_address, &amount_b);
    assert_eq!(id_2, 2);

    // Escrow contract holds total combined balance
    assert_eq!(token_client.balance(&client.address), amount_a + amount_b);

    // Approve Task 2 first (out-of-order execution)
    client.approve_task(&id_2);

    assert_eq!(token_client.balance(&freelancer_y), amount_b);
    assert_eq!(token_client.balance(&freelancer_x), 0);
    assert_eq!(token_client.balance(&client.address), amount_a);

    let task_1 = client.get_task(&id_1);
    let task_2 = client.get_task(&id_2);
    assert!(!task_1.is_approved);
    assert!(task_2.is_approved);

    // Approve Task 1
    client.approve_task(&id_1);
    assert_eq!(token_client.balance(&freelancer_x), amount_a);
    assert_eq!(token_client.balance(&client.address), 0);
}
