package com.naijagov.naijagov.repository;

import com.naijagov.naijagov.model.LocalGov;
import org.springframework.data.repository.PagingAndSortingRepository;
import org.springframework.stereotype.Repository;

@Repository("localGovRepository")
public interface LocalGovRepository extends PagingAndSortingRepository<LocalGov, Integer>{

}