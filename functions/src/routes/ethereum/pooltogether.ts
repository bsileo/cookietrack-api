
// Imports:
import { minABI, pooltogether } from '../../ABIs';
import { initResponse, query, addToken, addLPToken } from '../../functions';
import type { Request } from 'express';
import type { Chain, Address, Token, LPToken } from 'cookietrack-types';

// Initializations:
const chain: Chain = 'eth';
const project = 'pooltogether';
const poolRegistry: Address = '0x34733851E2047F8d0e1aa91124A6f9EaDc54D253';
const podRegistry: Address = '0x4658f736b93dCDdCbCe46cDe955970E697fd351f';
const lpPool: Address = '0x3AF7072D29Adde20FC7e173a7CB9e45307d2FB0A';
const poolV4: Address = '0xdd4d117723C257CEe402285D3aCF218E9A8236E1';
const poolToken: Address = '0x0cEC1A9154Ff802e7934Fc916Ed7Ca50bDE6844e';
const usdc: Address = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';

/* ========================================================================================================================================================================= */

// GET Function:
exports.get = async (req: Request): Promise<string> => {

  // Initializing Response:
  let response = initResponse(req);

  // Fetching Response Data:
  if(response.status === 'ok') {
    try {
      let wallet = req.query.address as Address;
      response.data.push(...(await getPoolBalances(wallet)));
      response.data.push(...(await getPodBalances(wallet)));
      response.data.push(...(await getPoolBalanceV4(wallet)));
    } catch(err: any) {
      console.error(err);
      response.status = 'error';
      response.data = [{error: 'Internal API Error'}];
    }
  }

  // Returning Response:
  return JSON.stringify(response, null, ' ');
}

/* ========================================================================================================================================================================= */

// Function to get pool balances:
const getPoolBalances = async (wallet: Address) => {
  let balances: (Token | LPToken)[] = [];

  // Populating Pools Array:
  let pools: { address: Address, faucets: Address[] }[] = [];
  let poolList: Address[] = await query(chain, poolRegistry, pooltogether.registryABI, 'getAddresses', []);
  poolList = [...poolList, lpPool];
  let faucet_promises = poolList.map(address => (async () => {
    let strategy = await query(chain, address, pooltogether.poolABI, 'prizeStrategy', []);
    let listener = await query(chain, strategy, pooltogether.strategyABI, 'tokenListener', []);
    if(address === lpPool || address.toLowerCase() === '0xc2a7Dfb76E93d12a1bB1Fa151b9900158090395d'.toLowerCase()) {
      pools.push({ address, faucets: [listener] });
    } else {
      let faucetList = (await query(chain, listener, pooltogether.listenerABI, 'getAddresses', [])).slice(0, -1);
      pools.push({ address, faucets: [...faucetList] });
    }
  })());
  await Promise.all(faucet_promises);

  // Fetching Pool Balances:
  let promises = pools.map(pool => (async () => {
    let ticket = (await query(chain, pool.address, pooltogether.poolABI, 'tokens', []))[1];
    let balance = parseInt(await query(chain, ticket, minABI, 'balanceOf', [wallet]));
    if(balance > 0) {
      let token = await query(chain, pool.address, pooltogether.poolABI, 'token', []);

      // LP Pool:
      if(token.toLowerCase() === '0x85Cb0baB616Fe88a89A35080516a8928F38B518b'.toLowerCase()) {
        let newToken = await addLPToken(chain, project, 'staked', token, balance, wallet);
        balances.push(newToken);

      // All Other Pools:
      } else {
        let newToken = await addToken(chain, project, 'staked', token, balance, wallet);
        balances.push(newToken);
      }

      // Faucet Rewards:
      let reward_promises = pool.faucets.map(faucet => (async () => {
        let balance = parseInt((await query(chain, faucet, pooltogether.faucetABI, 'userStates', [wallet])).balance);
        if(balance > 0) {
          let token = await query(chain, faucet, pooltogether.faucetABI, 'asset', []);
          if(token.toLowerCase() === '0x27D22A7648e955E510a40bDb058333E9190d12D4'.toLowerCase()) {
            token = poolToken;
          }
          let newToken = await addToken(chain, project, 'unclaimed', token, balance, wallet);
          balances.push(newToken);
        }
      })());
      await Promise.all(reward_promises);
    }
  })());
  await Promise.all(promises);
  return balances;
}

// Function to get pod balances:
const getPodBalances = async (wallet: Address) => {
  let balances: Token[] = [];
  let pods: Address[] = await query(chain, podRegistry, pooltogether.registryABI, 'getAddresses', []);
  let promises = pods.map(pod => (async () => {
    let balance = parseInt(await query(chain, pod, pooltogether.podABI, 'balanceOfUnderlying', [wallet]));
    if(balance > 0) {
      let token = await query(chain, pod, pooltogether.podABI, 'token', []);
      let newToken = await addToken(chain, project, 'staked', token, balance, wallet);
      balances.push(newToken);
    }
  })());
  await Promise.all(promises);
  return balances;
}

// Function to get V4 pool balance:
const getPoolBalanceV4 = async (wallet: Address) => {
  let balance = parseInt(await query(chain, poolV4, minABI, 'balanceOf', [wallet]));
  if(balance > 0) {
    let newToken = await addToken(chain, project, 'staked', usdc, balance, wallet);
    return [newToken];
  } else {
    return [];
  }
}